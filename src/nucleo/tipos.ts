// Copiado de Ganosete/futsal-tracking@dfe28e3 (rama solo-eventos): Vec2 de
// src/core/types.ts, MedidasPista de src/court/pista.ts, y OrigenBalon y
// PuntoBalon de src/ball/trayectoriaBalon.ts.
// Cambios: solo los tipos que necesitan fusion.ts y porBalon.ts, juntos aqui;
// el seguimiento del balon y la geometria de la pista llegan en la fase 3.

/** Coordenadas de pista en metros, con el origen en una esquina. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface MedidasPista {
  largo: number;
  ancho: number;
}

export type OrigenBalon = 'medido' | 'interpolado' | 'predicho';

export interface PuntoBalon {
  segundos: number;
  metros: Vec2;
  /** Modulo de la velocidad estimada, en m/s. */
  velocidad: number;
  origen: OrigenBalon;
}
