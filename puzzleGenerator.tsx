// --- Tipos de Datos para el Rompecabezas ---

// Define la forma de cada uno de los cuatro lados de una pieza.
export enum EdgeType {
  FLAT, // Borde plano (para los bordes del rompecabezas)
  IN,   // Muesca hacia adentro
  OUT,  // Muesca hacia afuera
}

// La información de cada pieza ahora incluye su forma y la porción de la imagen que muestra.
export interface Piece {
  id: string;
  shape: { top: EdgeType; right: EdgeType; bottom: EdgeType; left: EdgeType };
  // La ruta SVG que define la forma recortada de la pieza.
  svgClipPath: string; 
  // Coordenadas (x, y) de la esquina superior izquierda de la pieza en la imagen original.
  sourceX: number;
  sourceY: number;
  initialX: number;
  initialY: number;
}

export interface Slot {
  id: string;
  x: number;
  y: number;
}

// Datos completos del rompecabezas generado.
export interface PuzzleData {
  pieces: Piece[];
  slots: Slot[];
  boardSize: { width: number; height: number };
  pieceSize: number; // Tamaño de la pieza en la pantalla
  pieceSizeInImage: number; // Tamaño de la pieza en la imagen original
  image: { uri: string; width: number; height: number };
}

// --- Configuración para la Generación ---

export interface PuzzleConfig {
  gridSize: { rows: number; cols: number };
  image: { uri:string; width: number; height: number };
  screenWidth: number;
  screenHeight: number;
  boardMargin: number;
}

/**
 * CORREGIDO: Genera la ruta SVG para un lado de la pieza, dependiendo de su dirección.
 * @param edgeType El tipo de muesca.
 * @param pieceSize El tamaño de la pieza.
 * @param direction La dirección en la que se dibuja el lado.
 * @returns Una cadena con los comandos de la ruta SVG.
 */
const getEdgePath = (edgeType: EdgeType, pieceSize: number, direction: 'right' | 'down' | 'left' | 'up'): string => {
    const notchSize = pieceSize * 0.4;
    const sweep = pieceSize * 0.25;
    let path = '';

    // Los comandos relativos (c, s, l) facilitan el dibujo
    switch (direction) {
        case 'right':
            if (edgeType === EdgeType.FLAT) path = `l ${pieceSize},0`;
            else if (edgeType === EdgeType.IN) path = `c ${sweep},0 ${sweep},${-notchSize} ${pieceSize / 2},${-notchSize} s 0,${notchSize} ${pieceSize / 2},${notchSize}`;
            else path = `c ${sweep},0 ${sweep},${notchSize} ${pieceSize / 2},${notchSize} s 0,${-notchSize} ${pieceSize / 2},${-notchSize}`;
            break;
        case 'down':
            if (edgeType === EdgeType.FLAT) path = `l 0,${pieceSize}`;
            else if (edgeType === EdgeType.IN) path = `c 0,${sweep} ${notchSize},${sweep} ${notchSize},${pieceSize / 2} s ${-notchSize},0 ${-notchSize},${pieceSize / 2}`;
            else path = `c 0,${sweep} ${-notchSize},${sweep} ${-notchSize},${pieceSize / 2} s ${notchSize},0 ${notchSize},${pieceSize / 2}`;
            break;
        case 'left':
            if (edgeType === EdgeType.FLAT) path = `l ${-pieceSize},0`;
            else if (edgeType === EdgeType.IN) path = `c ${-sweep},0 ${-sweep},${notchSize} ${-pieceSize / 2},${notchSize} s 0,${-notchSize} ${-pieceSize / 2},${-notchSize}`;
            else path = `c ${-sweep},0 ${-sweep},${-notchSize} ${-pieceSize / 2},${-notchSize} s 0,${notchSize} ${-pieceSize / 2},${notchSize}`;
            break;
        case 'up':
            if (edgeType === EdgeType.FLAT) path = `l 0,${-pieceSize}`;
            else if (edgeType === EdgeType.IN) path = `c 0,${-sweep} ${-notchSize},${-sweep} ${-notchSize},${-pieceSize / 2} s ${notchSize},0 ${notchSize},${-pieceSize / 2}`;
            else path = `c 0,${-sweep} ${notchSize},${-sweep} ${notchSize},${-pieceSize / 2} s ${-notchSize},0 ${-notchSize},${-pieceSize / 2}`;
            break;
    }
    return path;
};

/**
 * CORREGIDO: Construye una única ruta SVG continua y cerrada para la pieza.
 * @param shape La forma de los cuatro lados de la pieza.
 * @param pieceSize El tamaño de la pieza.
 * @returns La cadena de la ruta SVG completa.
 */
const buildPiecePath = (shape: Piece['shape'], pieceSize: number): string => {
  const { top, right, bottom, left } = shape;

  // La ruta empieza en la esquina superior izquierda
  const commands = [`M 0,0`];
  
  // Se añaden los comandos para cada lado en orden
  commands.push(getEdgePath(top, pieceSize, 'right'));
  commands.push(getEdgePath(right, pieceSize, 'down'));
  commands.push(getEdgePath(bottom, pieceSize, 'left'));
  commands.push(getEdgePath(left, pieceSize, 'up'));

  commands.push('Z'); // Se cierra la ruta
  
  return commands.join(' ');
};


// --- Función Principal del Generador de Rompecabezas ---

export const generatePuzzle = (config: PuzzleConfig): PuzzleData => {
  const { gridSize, image, screenWidth, screenHeight, boardMargin } = config;
  const { rows, cols } = gridSize;
  
  const availableWidth = screenWidth - (boardMargin * 2);
  const pieceSizeOnScreen = Math.floor(availableWidth / cols);
  const pieceSizeInImage = Math.floor(image.width / cols);

  const boardWidth = pieceSizeOnScreen * cols;
  const boardHeight = pieceSizeOnScreen * rows;

  const slots: Slot[] = [];
  const pieces: Piece[] = [];
  
  const pieceShapes: Piece['shape'][][] = Array(rows).fill(0).map(() => Array(cols).fill({ top: EdgeType.FLAT, right: EdgeType.FLAT, bottom: EdgeType.FLAT, left: EdgeType.FLAT }));

  // 1. Determinar la forma de cada pieza, asegurando que los bordes coincidan
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shape: Piece['shape'] = { top: EdgeType.FLAT, right: EdgeType.FLAT, bottom: EdgeType.FLAT, left: EdgeType.FLAT };
      
      shape.top = r === 0 ? EdgeType.FLAT : (pieceShapes[r-1][c].bottom === EdgeType.IN ? EdgeType.OUT : EdgeType.IN);
      shape.left = c === 0 ? EdgeType.FLAT : (pieceShapes[r][c-1].right === EdgeType.IN ? EdgeType.OUT : EdgeType.IN);
      shape.right = c === cols - 1 ? EdgeType.FLAT : (Math.random() > 0.5 ? EdgeType.IN : EdgeType.OUT);
      shape.bottom = r === rows - 1 ? EdgeType.FLAT : (Math.random() > 0.5 ? EdgeType.IN : EdgeType.OUT);

      pieceShapes[r][c] = shape;
    }
  }

  // 2. Generar los datos de cada pieza y su slot correspondiente
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `r${r}c${c}`;
      const shape = pieceShapes[r][c];
      
      const spawnAreaY = boardMargin + boardHeight + 50;
      const initialX = Math.random() * (screenWidth - pieceSizeOnScreen);
      const initialY = spawnAreaY + Math.random() * (screenHeight - spawnAreaY - pieceSizeOnScreen);
      
      slots.push({ id, x: c * pieceSizeOnScreen, y: r * pieceSizeOnScreen });

      pieces.push({
        id,
        shape,
        svgClipPath: buildPiecePath(shape, pieceSizeInImage), // La forma se basa en el tamaño de la imagen
        sourceX: c * pieceSizeInImage,
        sourceY: r * pieceSizeInImage,
        initialX,
        initialY,
      });
    }
  }

  return {
    pieces: pieces.sort(() => 0.5 - Math.random()), // Baraja las piezas
    slots,
    boardSize: { width: boardWidth, height: boardHeight },
    pieceSize: pieceSizeOnScreen, // El tamaño en la pantalla
    pieceSizeInImage,
    image
  };
};

