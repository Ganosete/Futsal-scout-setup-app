#!/usr/bin/env python3
# Copiado de Ganosete/futsal-tracking@6cd4098 (rama main), tools/preparar_dataset_futsal.py.
# Cambios: ninguno.
"""
Prepara un dataset de futsal en formato COCO para afinar el detector.

Junta uno o varios datasets (los de Roboflow Universe vienen asi), reduce sus
clases a las dos que la app necesita y comprueba que lo que sale tiene sentido.

    python tools/preparar_dataset_futsal.py \\
        --entrada datasets/futsal-a datasets/futsal-b \\
        --salida datasets/futsal \\
        --clases person=jugador,player=jugador,ball=balon,sports_ball=balon

Estructura esperada de cada --entrada (la de Roboflow):

    entrada/
      train/_annotations.coco.json  + imagenes
      valid/_annotations.coco.json  + imagenes
      test/_annotations.coco.json   + imagenes

Lo que sale en --salida tiene la misma forma, con las imagenes ENLAZADAS (o
copiadas con --copiar) y un solo mapa de clases: 1 = jugador, 2 = balon.

Sobre las licencias: cada dataset de Universe trae la suya y no todas permiten
uso comercial. Comprueba la de cada uno antes de publicar nada entrenado con
ellos; este script no lo hace por ti.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from collections import Counter
from pathlib import Path

CLASES_SALIDA = [
    {"id": 1, "name": "jugador", "supercategory": "futsal"},
    {"id": 2, "name": "balon", "supercategory": "futsal"},
]
PARTICIONES = ("train", "valid", "test")


def leer_mapa(texto: str) -> dict[str, str]:
    mapa: dict[str, str] = {}
    for trozo in texto.split(","):
        if not trozo.strip():
            continue
        origen, _, destino = trozo.partition("=")
        mapa[origen.strip().lower()] = destino.strip().lower()
    return mapa


def caja_valida(caja: list[float], ancho: int, alto: int) -> bool:
    x, y, w, h = caja
    if w <= 1 or h <= 1:
        return False
    if x < -1 or y < -1 or x + w > ancho + 1 or y + h > alto + 1:
        return False
    return True


def procesar(entradas: list[Path], salida: Path, mapa: dict[str, str], copiar: bool) -> None:
    nombre_a_id = {c["name"]: c["id"] for c in CLASES_SALIDA}

    for particion in PARTICIONES:
        destino = salida / particion
        destino.mkdir(parents=True, exist_ok=True)
        imagenes: list[dict] = []
        anotaciones: list[dict] = []
        siguiente_imagen = 1
        siguiente_anotacion = 1
        cuenta = Counter()
        descartadas = Counter()

        for raiz in entradas:
            fichero = raiz / particion / "_annotations.coco.json"
            if not fichero.exists():
                print(f"  (sin {particion} en {raiz})")
                continue
            datos = json.loads(fichero.read_text(encoding="utf-8"))
            por_id = {c["id"]: c["name"].strip().lower() for c in datos.get("categories", [])}

            # Las anotaciones se agrupan por imagen para poder saltarse las
            # imagenes que se quedan sin ninguna caja util.
            por_imagen: dict[int, list[dict]] = {}
            for a in datos.get("annotations", []):
                por_imagen.setdefault(a["image_id"], []).append(a)

            for img in datos.get("images", []):
                utiles = []
                for a in por_imagen.get(img["id"], []):
                    nombre = mapa.get(por_id.get(a["category_id"], ""), "")
                    if nombre not in nombre_a_id:
                        descartadas["clase no mapeada"] += 1
                        continue
                    if not caja_valida(a["bbox"], img["width"], img["height"]):
                        descartadas["caja imposible"] += 1
                        continue
                    utiles.append((nombre, a))
                if not utiles:
                    descartadas["imagen sin cajas"] += 1
                    continue

                origen = raiz / particion / img["file_name"]
                if not origen.exists():
                    descartadas["imagen que falta"] += 1
                    continue
                # El nombre lleva el dataset delante: dos datasets distintos
                # suelen traer ficheros que se llaman igual.
                nuevo_nombre = f"{raiz.name}__{img['file_name']}"
                ruta = destino / nuevo_nombre
                if not ruta.exists():
                    if copiar:
                        shutil.copy2(origen, ruta)
                    else:
                        os.link(origen, ruta)

                imagenes.append(
                    {
                        "id": siguiente_imagen,
                        "file_name": nuevo_nombre,
                        "width": img["width"],
                        "height": img["height"],
                    }
                )
                for nombre, a in utiles:
                    anotaciones.append(
                        {
                            "id": siguiente_anotacion,
                            "image_id": siguiente_imagen,
                            "category_id": nombre_a_id[nombre],
                            "bbox": [round(v, 2) for v in a["bbox"]],
                            "area": round(a["bbox"][2] * a["bbox"][3], 2),
                            "iscrowd": 0,
                        }
                    )
                    cuenta[nombre] += 1
                    siguiente_anotacion += 1
                siguiente_imagen += 1

        (destino / "_annotations.coco.json").write_text(
            json.dumps(
                {"images": imagenes, "annotations": anotaciones, "categories": CLASES_SALIDA},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"{particion}: {len(imagenes)} imagenes, {len(anotaciones)} cajas {dict(cuenta)}")
        if descartadas:
            print(f"  descartado: {dict(descartadas)}")
        if imagenes and cuenta["balon"] < 0.05 * cuenta["jugador"]:
            print("  AVISO: hay muy pocos balones. El detector no aprendera a verlos.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--entrada", nargs="+", required=True, type=Path)
    p.add_argument("--salida", required=True, type=Path)
    p.add_argument(
        "--clases",
        default="person=jugador,player=jugador,people=jugador,ball=balon,sports_ball=balon,sports ball=balon",
        help="pares origen=destino separados por comas; destino es jugador o balon",
    )
    p.add_argument("--copiar", action="store_true", help="copiar en vez de enlazar")
    args = p.parse_args()

    procesar(args.entrada, args.salida, leer_mapa(args.clases), args.copiar)
    print(f"\nListo en {args.salida}. Ahora: python tools/afinar_rfdetr_futsal.py --dataset {args.salida}")


if __name__ == "__main__":
    main()
