#!/usr/bin/env python3
"""Un detector de juguete con la misma firma que RF-DETR Nano, para las pruebas.

El de verdad pesa 108 MB y no cabe en el repositorio ni en cada ejecucion de
la CI. Este tiene la misma entrada (`input`, [1, 3, 384, 384]) y las mismas
salidas (`pred_boxes` [1, N, 4] y `pred_logits` [1, N, 91]), y siempre "ve"
lo mismo: dos jugadores y el balon a los pies del de la izquierda. Asi se
prueba todo el camino (descarga, sesion, preproceso, posproceso) sin el modelo.

Uso: pip install onnx numpy && python3 tools/crear_modelo_prueba.py
"""
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

SALIDA = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'detector_prueba.onnx'

# cx, cy, w, h normalizados sobre la entrada; clase COCO-91 (1 persona, 37 balon).
CONSULTAS = [
    ((0.30, 0.50, 0.10, 0.40), 1),
    ((0.70, 0.50, 0.10, 0.40), 1),
    ((0.30, 0.69, 0.02, 0.03), 37),
]

cajas = np.array([[c for c, _ in CONSULTAS]], dtype=np.float32)
logits = np.full((1, len(CONSULTAS), 91), -10.0, dtype=np.float32)
for i, (_, clase) in enumerate(CONSULTAS):
    logits[0, i, clase] = 5.0

# Las salidas dependen de la entrada (por cero): un grafo con la entrada sin
# usar puede perderla al optimizarse, y entonces no se parece al de verdad.
nodos = [
    helper.make_node('ReduceMean', ['input'], ['media'], keepdims=1),
    helper.make_node('Mul', ['media', 'cero'], ['nada']),
    helper.make_node('Reshape', ['nada', 'forma_escalar'], ['nada_escalar']),
    helper.make_node('Add', ['cajas', 'nada_escalar'], ['pred_boxes']),
    helper.make_node('Add', ['logits', 'nada_escalar'], ['pred_logits']),
]
iniciales = [
    numpy_helper.from_array(cajas, 'cajas'),
    numpy_helper.from_array(logits, 'logits'),
    numpy_helper.from_array(np.array(0.0, dtype=np.float32), 'cero'),
    numpy_helper.from_array(np.array([], dtype=np.int64), 'forma_escalar'),
]
grafo = helper.make_graph(
    nodos,
    'detector_prueba',
    [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, 384, 384])],
    [
        helper.make_tensor_value_info('pred_boxes', TensorProto.FLOAT, [1, len(CONSULTAS), 4]),
        helper.make_tensor_value_info('pred_logits', TensorProto.FLOAT, [1, len(CONSULTAS), 91]),
    ],
    iniciales,
)
modelo = helper.make_model(grafo, opset_imports=[helper.make_opsetid('', 17)], producer_name='futsal-scout')
modelo.ir_version = 8
onnx.checker.check_model(modelo)
SALIDA.write_bytes(modelo.SerializeToString())
print(f'{SALIDA} ({SALIDA.stat().st_size} bytes)')
