import React, { useState, useCallback, useRef, createRef, forwardRef, useImperativeHandle, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, StatusBar, Button, LayoutChangeEvent, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
// --- IMPORTACIÓN DE COMPONENTES SVG ---
import Svg, { Image, ClipPath, Path } from 'react-native-svg';
// --- IMPORTACIÓN DEL NUEVO GENERADOR ---
import { generatePuzzle, PuzzleData, Piece, Slot } from './puzzleGenerator';


// --- Configuración del Rompecabezas ---
const BOARD_MARGIN = 20;
const SNAP_THRESHOLD = 50;

// --- DEFINICIÓN DEL PAQUETE DE ROMPECABEZAS ---
const PUZZLE_IMAGE = {
  uri: 'https://images.pexels.com/photos/110854/pexels-photo-110854.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  width: 1260,
  height: 750,
};

const playSound = (soundName: 'snap-correct' | 'snap-wrong') => { console.log(`Reproduciendo sonido: ${soundName}`); };

interface DraggablePieceRef { reset: () => void; }

const GlowingSlot = ({ slot, isGlowing, boardLayout, pieceSize }: { slot: Slot, isGlowing: boolean, boardLayout: { x: number, y: number } | null, pieceSize: number }) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0);
    useEffect(() => {
        if (isGlowing) {
            scale.value = 1;
            opacity.value = 0;
            opacity.value = withSequence(withTiming(0.6, { duration: 500 }), withTiming(0, { duration: 500 }));
            scale.value = withTiming(1.6, { duration: 1000 });
        }
    }, [isGlowing, scale, opacity]);
    const animatedGlowStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
    if (!boardLayout) return null;
    return <Animated.View style={[ styles.glow, { width: pieceSize, height: pieceSize, top: boardLayout.y + slot.y, left: boardLayout.x + slot.x }, animatedGlowStyle ]} />;
};

// --- Componente de Pieza Arrastrable (Ahora con SVG) ---
const DraggablePiece = forwardRef<DraggablePieceRef, { piece: Piece, targetSlot: Slot, onSnap: (pieceId: string) => void, boardLayout: { x: number, y: number } | null, pieceSize: number, pieceSizeInImage: number, image: PuzzleData['image'] }>(({ piece, targetSlot, onSnap, boardLayout, pieceSize, pieceSizeInImage, image }, ref) => {
  const isDragging = useSharedValue(false);
  const isSnapped = useSharedValue(false);
  const offsetX = useSharedValue(piece.initialX);
  const offsetY = useSharedValue(piece.initialY);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

  const resetPosition = useCallback(() => { 'worklet'; offsetX.value = withSpring(piece.initialX); offsetY.value = withSpring(piece.initialY); isSnapped.value = false; }, [piece.initialX, piece.initialY, offsetX, offsetY, isSnapped]);
  useImperativeHandle(ref, () => ({ reset: resetPosition }));

  const panGesture = Gesture.Pan()
    .onStart(() => { if (isSnapped.value) return; contextX.value = offsetX.value; contextY.value = offsetY.value; isDragging.value = true; })
    .onUpdate((event) => { if (isSnapped.value) return; offsetX.value = contextX.value + event.translationX; offsetY.value = contextY.value + event.translationY; })
    .onEnd(() => {
      if (!boardLayout) { offsetX.value = withSpring(piece.initialX); offsetY.value = withSpring(piece.initialY); return; }
      const absoluteTargetX = boardLayout.x + targetSlot.x; const absoluteTargetY = boardLayout.y + targetSlot.y;
      const distance = Math.sqrt(Math.pow(offsetX.value - absoluteTargetX, 2) + Math.pow(offsetY.value - absoluteTargetY, 2));
      if (distance < SNAP_THRESHOLD) { offsetX.value = withSpring(absoluteTargetX); offsetY.value = withSpring(absoluteTargetY); isSnapped.value = true; runOnJS(onSnap)(piece.id); runOnJS(playSound)('snap-correct'); } 
      else { offsetX.value = withSpring(piece.initialX); offsetY.value = withSpring(piece.initialY); runOnJS(playSound)('snap-wrong'); }
    })
    .onFinalize(() => { isDragging.value = false; });

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }, { scale: withSpring(isDragging.value ? 1.2 : 1) },],
    zIndex: isDragging.value ? 100 : (isSnapped.value ? 10 : 1),
    width: pieceSize * 1.5,
    height: pieceSize * 1.5,
    // Se ajusta el posicionamiento para centrar la pieza correctamente
    left: -pieceSize * 0.25,
    top: -pieceSize * 0.25,
  }));

  // --- CORRECCIÓN DEL SVG ---
  // Se calcula el viewBox para centrar la pieza sin usar un <G> transform.
  const viewBoxMinX = -pieceSizeInImage * 0.25;
  const viewBoxMinY = -pieceSizeInImage * 0.25;
  const viewBoxWidth = pieceSizeInImage * 1.5;
  const viewBoxHeight = pieceSizeInImage * 1.5;

  return (
    <Animated.View style={animatedStyle}>
      <Svg 
        width={pieceSize * 1.5} 
        height={pieceSize * 1.5} 
        viewBox={`${viewBoxMinX} ${viewBoxMinY} ${viewBoxWidth} ${viewBoxHeight}`}
      >
        <ClipPath id={`clip_${piece.id}`}>
          <Path d={piece.svgClipPath} />
        </ClipPath>
        <Image
          href={image.uri}
          width={image.width}
          height={image.height}
          preserveAspectRatio="xMidYMid slice"
          x={-piece.sourceX}
          y={-piece.sourceY}
          clipPath={`url(#clip_${piece.id})`}
        />
      </Svg>
    </Animated.View>
  );
});

const App = () => {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [snappedPieces, setSnappedPieces] = useState<Set<string>>(new Set());
  const [boardLayout, setBoardLayout] = useState<{ x: number, y: number } | null>(null);
  const [glowingSlots, setGlowingSlots] = useState<Set<string>>(new Set());
  
  const pieceRefs = useMemo(() => puzzle ? puzzle.pieces.map(() => createRef<DraggablePieceRef>()) : [], [puzzle]);
  
  const createNewPuzzle = useCallback((rows: number, cols: number) => {
    const { width, height } = Dimensions.get('window');
    const newPuzzle = generatePuzzle({
      gridSize: { rows, cols },
      image: PUZZLE_IMAGE,
      screenWidth: width,
      screenHeight: height,
      boardMargin: BOARD_MARGIN,
    });
    setPuzzle(newPuzzle);
    setSnappedPieces(new Set());
    setGlowingSlots(new Set());
    setBoardLayout(null);
  }, []);

  useEffect(() => { createNewPuzzle(2, 3); }, [createNewPuzzle]);

  const handleSnap = useCallback((pieceId: string) => { setSnappedPieces(prev => new Set(prev).add(pieceId)); setGlowingSlots(prev => new Set(prev).add(pieceId)); }, []);
  const handleBoardLayout = (event: LayoutChangeEvent) => { const { x, y } = event.nativeEvent.layout; setBoardLayout({ x, y }); };

  const hasWon = puzzle && snappedPieces.size === puzzle.pieces.length;

  if (!puzzle) { return <View style={styles.loadingContainer}><ActivityIndicator size="large" /><Text>Generando Rompecabezas...</Text></View>; }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}><Text style={styles.title}>Rompecabezas</Text><Text style={styles.progressText}>Completado: {snappedPieces.size} / {puzzle.pieces.length}</Text></View>
        <View style={[styles.board, { width: puzzle.boardSize.width, height: puzzle.boardSize.height }]} onLayout={handleBoardLayout}>
          {puzzle.slots.map(slot => <View key={`slot_${slot.id}`} style={[styles.slot, { width: puzzle.pieceSize, height: puzzle.pieceSize, top: slot.y, left: slot.x }]} />)}
        </View>

        {boardLayout && puzzle.slots.map(slot => <GlowingSlot key={`glow_${slot.id}`} slot={slot} isGlowing={glowingSlots.has(slot.id)} boardLayout={boardLayout} pieceSize={puzzle.pieceSize} />)}
        
        {boardLayout && puzzle.pieces.map((piece, index) => {
          const targetSlot = puzzle.slots.find(slot => slot.id === piece.id);
          if (!targetSlot) return null;
          return <DraggablePiece 
            ref={pieceRefs[index]} 
            key={piece.id} 
            piece={piece} 
            targetSlot={targetSlot} 
            onSnap={handleSnap} 
            boardLayout={boardLayout} 
            pieceSize={puzzle.pieceSize} 
            pieceSizeInImage={puzzle.pieceSizeInImage}
            image={puzzle.image} 
          />;
        })}

        {hasWon && <View style={styles.winContainer}><Text style={styles.winText}>¡Felicidades!</Text></View>}
        <View style={styles.footer}><Button title="Nuevo (2x3)" onPress={() => createNewPuzzle(2, 3)} /><Button title="Nuevo (3x4)" onPress={() => createNewPuzzle(3, 4)} /></View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  header: { paddingVertical: 15 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#333' },
  progressText: { fontSize: 16, textAlign: 'center', color: '#666', marginTop: 5 },
  board: { alignSelf: 'center', borderWidth: 2, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff', marginTop: 20 },
  slot: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed', borderColor: '#aaa', backgroundColor: 'rgba(0,0,0,0.05)' },
  glow: { borderRadius: 8, backgroundColor: '#FFD700', position: 'absolute', zIndex: 50 },
  footer: { position: 'absolute', bottom: 30, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly' },
  winContainer: { position: 'absolute', top: '40%', alignSelf: 'center', padding: 20, backgroundColor: 'rgba(34, 139, 34, 0.85)', borderRadius: 10 },
  winText: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

export default App;

