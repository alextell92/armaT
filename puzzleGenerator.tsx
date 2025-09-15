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
 * Genera la ruta SVG para un lado de la pieza, garantizando que las muescas sean simétricas.
 */
const getEdgePath = (edgeType: EdgeType, pieceSize: number, direction: 'right' | 'down' | 'left' | 'up'): string => {
    if (edgeType === EdgeType.FLAT) {
        switch (direction) {
            case 'right': return `l ${pieceSize},0`;
            case 'down':  return `l 0,${pieceSize}`;
            case 'left':  return `l ${-pieceSize},0`;
            case 'up':    return `l 0,${-pieceSize}`;
        }
    }

    const notchWidth = pieceSize * 0.4;
    const notchHeight = pieceSize * 0.22;
    const lineSegment = (pieceSize - notchWidth) / 2;

    const notchDirection = edgeType === EdgeType.OUT ? 1 : -1;
    let path = '';

    switch (direction) {
        case 'right': {
            const nH = notchHeight * notchDirection;
            path = `l ${lineSegment},0 c 0,${nH} ${notchWidth},${nH} ${notchWidth},0 l ${lineSegment},0`;
            break;
        }
        case 'down': {
            const nH = notchHeight * notchDirection;
            path = `l 0,${lineSegment} c ${nH},0 ${nH},${notchWidth} 0,${notchWidth} l 0,${lineSegment}`;
            break;
        }
        case 'left': {
            const nH = notchHeight * -notchDirection;
            path = `l ${-lineSegment},0 c 0,${nH} ${-notchWidth},${nH} ${-notchWidth},0 l ${-lineSegment},0`;
            break;
        }
        case 'up': {
            const nH = notchHeight * -notchDirection;
            path = `l 0,${-lineSegment} c ${nH},0 ${nH},${-notchWidth} 0,${-notchWidth} l 0,${-lineSegment}`;
            break;
        }
    }
    return path;
};


/**
 * Construye una única ruta SVG continua y cerrada para la pieza.
 */
const buildPiecePath = (shape: Piece['shape'], pieceSize: number): string => {
  const { top, right, bottom, left } = shape;
  const commands = [`M 0,0`];
  
  commands.push(getEdgePath(top, pieceSize, 'right'));
  commands.push(getEdgePath(right, pieceSize, 'down'));
  commands.push(getEdgePath(bottom, pieceSize, 'left'));
  commands.push(getEdgePath(left, pieceSize, 'up'));

  commands.push('Z'); // Cierra la ruta
  
  return commands.join(' ');
};


// --- Función Principal del Generador de Rompecabezas ---

export const generatePuzzle = (config: PuzzleConfig): PuzzleData => {
  const { gridSize, image, screenWidth, screenHeight, boardMargin } = config;
  const { rows, cols } = gridSize;
  
  const availableHeight = screenHeight * 0.9 - (boardMargin * 2);
  const imageAspectRatio = image.width / image.height;
  
  let boardHeight = availableHeight;
  let boardWidth = boardHeight * imageAspectRatio;

  const pieceSizeOnScreen = Math.floor(boardHeight / rows);
  const pieceSizeInImage = Math.floor(image.height / rows);

  boardWidth = pieceSizeOnScreen * cols;
  boardHeight = pieceSizeOnScreen * rows;

  const slots: Slot[] = [];
  const pieces: Piece[] = [];
  
  const pieceShapes: Piece['shape'][][] = Array(rows).fill(0).map(() => Array(cols).fill(0).map(() => ({ top: EdgeType.FLAT, right: EdgeType.FLAT, bottom: EdgeType.FLAT, left: EdgeType.FLAT })));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shape: Piece['shape'] = { top: EdgeType.FLAT, right: EdgeType.FLAT, bottom: EdgeType.FLAT, left: EdgeType.FLAT };
      
      shape.top = r === 0 ? EdgeType.FLAT : (pieceShapes[r-1][c].bottom === EdgeType.IN ? EdgeType.OUT : EdgeType.IN);
      shape.left = c === 0 ? EdgeType.FLAT : (pieceShapes[r][c-1].right === EdgeType.IN ? EdgeType.OUT : EdgeType.IN);
      shape.right = c === cols - 1 ? EdgeType.FLAT : (c % 2 === 0 ? EdgeType.OUT : EdgeType.IN);
      shape.bottom = r === rows - 1 ? EdgeType.FLAT : (r % 2 === 0 ? EdgeType.OUT : EdgeType.IN);

      pieceShapes[r][c] = shape;
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `r${r}c${c}`;
      const shape = pieceShapes[r][c];
      
      const spawnAreaX = boardMargin + boardWidth + 50;
      const spawnAreaWidth = screenWidth - spawnAreaX - boardMargin;
      const spawnAreaY = boardMargin;
      const spawnAreaHeight = screenHeight - (boardMargin * 2);

      const initialX = spawnAreaX + Math.random() * (spawnAreaWidth - pieceSizeOnScreen * 1.5);
      const initialY = spawnAreaY + Math.random() * (spawnAreaHeight - pieceSizeOnScreen * 1.5);
      
      slots.push({ id, x: c * pieceSizeOnScreen, y: r * pieceSizeOnScreen });

      pieces.push({
        id,
        shape,
        svgClipPath: buildPiecePath(shape, pieceSizeInImage),
        sourceX: c * pieceSizeInImage,
        sourceY: r * pieceSizeInImage,
        initialX,
        initialY,
      });
    }
  }

  return {
    pieces: pieces.sort(() => 0.5 - Math.random()),
    slots,
    boardSize: { width: boardWidth, height: boardHeight },
    pieceSize: pieceSizeOnScreen,
    pieceSizeInImage,
    image
  };
};

