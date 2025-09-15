const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { JSDOM } = require('jsdom');
const { SVG, registerWindow } = require('@svgdotjs/svg.js');

// --- Se emula un entorno de navegador para que la librería SVG funcione ---
const window = new JSDOM('').window;
registerWindow(window, window.document);

// --- Lógica de Generación de Formas de Piezas ---
const EdgeType = { FLAT: 0, IN: 1, OUT: 2 };

const getEdgePath = (edgeType, pieceSize, direction) => {
  if (edgeType === EdgeType.FLAT) {
    switch (direction) {
      case 'right':
        return `l ${pieceSize},0`;
      case 'down':
        return `l 0,${pieceSize}`;
      case 'left':
        return `l ${-pieceSize},0`;
      case 'up':
        return `l 0,${-pieceSize}`;
    }
  }
  const notchWidth = pieceSize * 0.4;
  const notchHeight = pieceSize * (0.22 + (Math.random() - 0.5) * 0.04);
  const lineSegment = (pieceSize - notchWidth) / 2;
  const notchDirection = edgeType === EdgeType.OUT ? 1 : -1;
  let pathCmd = '';
  switch (direction) {
    case 'right': {
      const nH = notchHeight * notchDirection;
      pathCmd = `l ${lineSegment},0 c 0,${nH} ${notchWidth},${nH} ${notchWidth},0 l ${lineSegment},0`;
      break;
    }
    case 'down': {
      const nH = notchHeight * notchDirection;
      pathCmd = `l 0,${lineSegment} c ${nH},0 ${nH},${notchWidth} 0,${notchWidth} l 0,${lineSegment}`;
      break;
    }
    case 'left': {
      const nH = notchHeight * -notchDirection;
      pathCmd = `l ${-lineSegment},0 c 0,${nH} ${-notchWidth},${nH} ${-notchWidth},0 l ${-lineSegment},0`;
      break;
    }
    case 'up': {
      const nH = notchHeight * -notchDirection;
      pathCmd = `l 0,${-lineSegment} c ${nH},0 ${nH},${-notchWidth} 0,${-notchWidth} l 0,${-lineSegment}`;
      break;
    }
  }
  return pathCmd;
};

const buildPiecePath = (shape, pieceSize) => {
  const { top, right, bottom, left } = shape;
  const commands = [`M 0,0`];
  commands.push(getEdgePath(top, pieceSize, 'right'));
  commands.push(getEdgePath(right, pieceSize, 'down'));
  commands.push(getEdgePath(bottom, pieceSize, 'left'));
  commands.push(getEdgePath(left, pieceSize, 'up'));
  commands.push('Z');
  return commands.join(' ');
};

// --- Función Principal del Script ---
async function generateAssets(config) {
  const { imagePath, outputDir, gridSize } = config;
  const { rows, cols } = gridSize;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const originalImage = sharp(imagePath);
  const originalMetadata = await originalImage.metadata();

  // --- CORRECCIÓN CLAVE: LÓGICA DE PRE-ESTIRAMIENTO ---
  // 1. Calculamos el aspect ratio al que el tablero de la App va a forzar la imagen.
  const targetAspectRatio = cols / rows;

  // 2. Calculamos las nuevas dimensiones, manteniendo la altura original y estirando el ancho.
  const targetHeight = originalMetadata.height;
  const targetWidth = Math.round(targetHeight * targetAspectRatio);

  console.log(
    `- Aspecto original: ${(
      originalMetadata.width / originalMetadata.height
    ).toFixed(4)}`,
  );
  console.log(
    `- Aspecto objetivo (Grid ${cols}x${rows}): ${targetAspectRatio.toFixed(
      4,
    )}`,
  );
  console.log(
    `- Estirando imagen de ${originalMetadata.width}x${targetHeight} a ${targetWidth}x${targetHeight} para que coincida.`,
  );

  // 3. Creamos un buffer de la imagen pre-estirada. 'fill' ignora el aspect ratio y estira.
  const stretchedImageBuffer = await originalImage
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'fill',
    })
    .toBuffer();

  // --- FIN DE LA CORRECCIÓN ---

  // A partir de aquí, TODO el script opera sobre la IMAGEN ESTIRADA, no la original.
  const image = sharp(stretchedImageBuffer);
  const metadata = await image.metadata(); // Metadatos de la imagen ya estirada

  // Esta lógica ahora funcionará, porque la imagen ya tiene el aspect ratio correcto
  // y las celdas resultantes serán cuadradas.
  const pieceSizeInImage = Math.floor(metadata.width / cols);

  const PADDING = Math.ceil(pieceSizeInImage * 0.5);

  // Creamos el canvas acolchado usando el buffer de la imagen estirada
  const paddedImageBuffer = await sharp({
    create: {
      width: metadata.width + PADDING * 2,
      height: metadata.height + PADDING * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: stretchedImageBuffer, left: PADDING, top: PADDING }])
    .png()
    .toBuffer();

  const pieceShapes = Array(rows)
    .fill(0)
    .map(() =>
      Array(cols)
        .fill(0)
        .map(() => ({})),
    );

  const patternChoice = Math.random();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shape = {};
      shape.top =
        r === 0
          ? EdgeType.FLAT
          : pieceShapes[r - 1][c].bottom === EdgeType.IN
          ? EdgeType.OUT
          : EdgeType.IN;
      shape.left =
        c === 0
          ? EdgeType.FLAT
          : pieceShapes[r][c - 1].right === EdgeType.IN
          ? EdgeType.OUT
          : EdgeType.IN;

      if (patternChoice < 0.33) {
        shape.right = c === cols - 1 ? EdgeType.FLAT : EdgeType.IN;
        shape.bottom = r === rows - 1 ? EdgeType.FLAT : EdgeType.OUT;
      } else if (patternChoice < 0.66) {
        shape.right = c === cols - 1 ? EdgeType.FLAT : EdgeType.OUT;
        shape.bottom = r === rows - 1 ? EdgeType.FLAT : EdgeType.IN;
      } else {
        shape.right =
          c === cols - 1
            ? EdgeType.FLAT
            : c % 2 === 0
            ? EdgeType.OUT
            : EdgeType.IN;
        shape.bottom =
          r === rows - 1
            ? EdgeType.FLAT
            : r % 2 === 0
            ? EdgeType.IN
            : EdgeType.OUT;
      }
      pieceShapes[r][c] = shape;
    }
  }

  const puzzleData = {
    gridSize,
    // Reporta el NUEVO aspect ratio. (metadata.width / metadata.height) ahora será cols/rows.
    imageAspectRatio: metadata.width / metadata.height,
    pieceSizeInImage,
    pieces: [],
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `r${r}c${c}`;
      const shape = pieceShapes[r][c];
      const svgPath = buildPiecePath(shape, pieceSizeInImage);

      const offsetX = pieceSizeInImage * 0.25;
      const offsetY = pieceSizeInImage * 0.25;
      const transformedSvgPath = svgPath.replace(
        'M 0,0',
        `M ${offsetX},${offsetY}`,
      );

      const canvas = SVG().size(pieceSizeInImage * 1.5, pieceSizeInImage * 1.5);
      canvas.path(transformedSvgPath).fill('#fff');
      // eslint-disable-next-line no-undef
      const maskBuffer = Buffer.from(canvas.svg());

      const extractLeft = c * pieceSizeInImage - offsetX + PADDING;
      const extractTop = r * pieceSizeInImage - offsetY + PADDING;

      const pieceImageBuffer = await sharp(paddedImageBuffer)
        .extract({
          left: Math.round(extractLeft),
          top: Math.round(extractTop),
          width: Math.round(pieceSizeInImage * 1.5),
          height: Math.round(pieceSizeInImage * 1.5),
        })
        .toBuffer();

      const pieceWithAlpha = await sharp(pieceImageBuffer)
        .composite([{ input: maskBuffer, blend: 'dest-in' }])
        .png()
        .toBuffer();

      const shadowLayer = await sharp(maskBuffer)
        .blur(6)
        .tint({ r: 0, g: 0, b: 0, alpha: 0.4 })
        .toBuffer();

      const finalPieceImage = await sharp({
        create: {
          width: Math.round(pieceSizeInImage * 1.5),
          height: Math.round(pieceSizeInImage * 1.5),
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          { input: shadowLayer, top: 6, left: 6 },
          { input: pieceWithAlpha, top: 0, left: 0 },
        ])
        .png()
        .toBuffer();

      const pieceFilename = `piece_${id}.png`;
      fs.writeFileSync(path.join(outputDir, pieceFilename), finalPieceImage);

      puzzleData.pieces.push({ id, assetUri: pieceFilename });
    }
  }

  fs.writeFileSync(
    path.join(outputDir, 'data.json'),
    JSON.stringify(puzzleData, null, 2),
  );

  // Guarda la IMAGEN ESTIRADA como el nuevo background.png
  fs.writeFileSync(
    path.join(outputDir, 'background.png'),
    stretchedImageBuffer,
  );

  // 1. Crea las entradas para el 'assetMap'
  const assetMapContent = puzzleData.pieces
    .map(p => {
      // La clave es el nombre de archivo, el valor es el require()
      return `  '${p.assetUri}': require('./${p.assetUri}'),`;
    })
    .join('\n'); // Une cada línea con un salto de línea

  // 2. Define el contenido completo del archivo .js
  const jsContent = `
// Este archivo es auto-generado por generate-assets.js
// Contiene todos los assets requeridos estáticamente para este nivel.

export const data = require('./data.json');
export const background = require('./background.png');
export const pieces = {
${assetMapContent}
};
`;

// 3. Escribe el archivo en el directorio de salida
  fs.writeFileSync(path.join(outputDir, 'level.assets.js'), jsContent);
  
  console.log(`- Archivo de assets 'level.assets.js' CREADO.`);
  // --- FIN DE LA MODIFICACIÓN ---


  console.log(`\n¡Éxito! Assets generados en: ${outputDir}`);
  console.log(`- ${puzzleData.pieces.length} piezas creadas.`);
  console.log(`- Archivo de datos 'data.json' creado.`);
  console.log(`- Imagen de fondo 'background.png' CREADA (pre-estirada).`);
}

// --- Lógica para ejecutar desde la línea de comandos ---
const args = process.argv.slice(2);
const config = {};
args.forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    if (key === '--grid') {
      const [rows, cols] = value.split('x').map(Number);
      config.gridSize = { rows, cols };
    } else {
      config[key.substring(2)] = value;
    }
  }
});

if (config.imagePath && config.outputDir && config.gridSize) {
  console.log(`\nGenerando rompecabezas con la siguiente configuración:`);
  console.log(`- Imagen de Origen: ${config.imagePath}`);
  console.log(`- Directorio de Salida: ${config.outputDir}`);
  console.log(
    `- Tamaño de Cuadrícula: ${config.gridSize.rows}x${config.gridSize.cols}`,
  );
  generateAssets(config);
} else {
  console.log(
    '\nUso: node generate-assets.js --imagePath=<ruta> --outputDir=<ruta> --grid=<filas>x<columnas>',
  );
  console.log(
    'Ejemplo: node generate-assets.js --imagePath=./source.png --outputDir=./assets/mundo1/nivel1 --grid=2x3\n',
  );
}
