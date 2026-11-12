#!/usr/bin/env python3
# Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tools/afinar_rfdetr_futsal.py.
# Cambios: lo que dice al acabar (y en la ayuda) es como se usa el modelo en esta app.
"""
Afina un RF-DETR sobre un dataset de futsal y lo exporta a ONNX para la app.

Esto se ejecuta UNA vez, fuera del navegador, en una maquina con GPU.

    python -m venv .venv && source .venv/bin/activate
    pip install rfdetr onnx onnxruntime
    python tools/preparar_dataset_futsal.py --entrada ... --salida datasets/futsal
    python tools/afinar_rfdetr_futsal.py --dataset datasets/futsal --epocas 30

Deja el modelo afinado y su `classes.json` en --salida. Para usarlo en la app:
subelo a Hugging Face y cambia DETECTOR en src/comun/modelos.ts (origen,
tamano, sha256, entrada, version) con clases { nombres: ['fondo', 'jugador',
'balon'], persona: 'jugador', balon: 'balon' }.

POR QUE AFINAR, si el COCO ya detecta "person" y "sports ball":

- El balon de futsal es del numero 4, va rapido y sale movido. En COCO,
  "sports ball" son sobre todo balones de futbol 11 y pelotas de tenis
  quietas; el recall en futsal es bajo y es lo que mas limita los eventos.
- En una pista hay gente en la grada, en el banquillo y arbitros. Un detector
  afinado a esta vista aprende que lo que esta fuera de la pista no cuenta.
- Los jugadores se tapan entre si mucho mas que los peatones de COCO.

QUE HACE FALTA: unas 2.000 imagenes anotadas de partidos parecidos a los tuyos
(camara alta, pista entera) reparten mejor que 20.000 de cualquier cosa. Con
menos de 500 no merece la pena: sale peor que el COCO de serie.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

CLASES = {1: "jugador", 2: "balon"}


def comprobar_dataset(dataset: Path) -> None:
    faltan = [p for p in ("train", "valid") if not (dataset / p / "_annotations.coco.json").exists()]
    if faltan:
        raise SystemExit(
            f"Al dataset le faltan las particiones {faltan}. "
            "Preparalo antes con tools/preparar_dataset_futsal.py."
        )
    anotaciones = json.loads((dataset / "train" / "_annotations.coco.json").read_text())
    n = len(anotaciones.get("images", []))
    if n < 500:
        print(f"AVISO: solo {n} imagenes de entrenamiento. Por debajo de 500 el")
        print("       modelo afinado suele salir PEOR que el COCO de serie.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dataset", required=True, type=Path)
    p.add_argument("--salida", default=Path("modelos"), type=Path)
    p.add_argument("--variante", default="nano", choices=["nano", "small", "medium", "base"])
    p.add_argument("--resolucion", type=int, default=560, help="multiplo de 56")
    p.add_argument("--epocas", type=int, default=30)
    p.add_argument("--lote", type=int, default=4)
    p.add_argument("--acumular", type=int, default=4, help="lotes acumulados; lote x acumular ~ 16")
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--solo-exportar", action="store_true", help="salta el entrenamiento")
    args = p.parse_args()

    if args.resolucion % 56 != 0:
        raise SystemExit("La resolucion de RF-DETR tiene que ser multiplo de 56.")
    comprobar_dataset(args.dataset)
    args.salida.mkdir(parents=True, exist_ok=True)

    from rfdetr import RFDETRBase, RFDETRLarge, RFDETRMedium, RFDETRNano, RFDETRSmall

    familias = {
        "nano": RFDETRNano,
        "small": RFDETRSmall,
        "medium": RFDETRMedium,
        "base": RFDETRBase,
        "large": RFDETRLarge,
    }
    modelo = familias[args.variante](resolution=args.resolucion)

    if not args.solo_exportar:
        # `early_stopping` evita seguir gastando GPU cuando la validacion ya no
        # mejora, que con datasets pequenos pasa pronto.
        modelo.train(
            dataset_dir=str(args.dataset),
            epochs=args.epocas,
            batch_size=args.lote,
            grad_accum_steps=args.acumular,
            lr=args.lr,
            output_dir=str(args.salida / "entrenamiento"),
            early_stopping=True,
        )

    modelo.export(output_dir=str(args.salida))

    # La app espera un mapa indice -> nombre. Aqui solo hay dos clases, y el 0
    # se reserva al fondo igual que en RF-DETR con COCO.
    clases = {"0": "fondo", **{str(k): v for k, v in CLASES.items()}}
    (args.salida / "classes.json").write_text(json.dumps(clases, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nListo en {args.salida}.")
    print("Para la app: subelo a Hugging Face y cambia DETECTOR en src/comun/modelos.ts")
    print(f"(origen, tamano, sha256, version y entrada {args.resolucion}) con las clases")
    print("{ nombres: ['fondo', 'jugador', 'balon'], persona: 'jugador', balon: 'balon' }.")
    print("Y midelo contra el de COCO con partidos de verdad antes de dejarlo.")


if __name__ == "__main__":
    main()
