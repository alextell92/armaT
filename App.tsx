import React, { useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle, createRef } from 'react';
import { StyleSheet, View, Text, StatusBar, Button, ActivityIndicator, Image as RNImage, ImageSourcePropType, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    useAnimatedScrollHandler,
    SharedValue,
    withTiming,
    withRepeat,
    interpolate,
    Easing,
} from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';

// --- Animated Background Component ---
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const Bubble = () => {
    const progress = useSharedValue(0);
    useEffect(() => {
        progress.value = withRepeat(withTiming(1, { duration: Math.random() * 5000 + 5000, easing: Easing.linear }), -1, false);
    }, [progress]);
    const animatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
        transform: [{ translateY: interpolate(progress.value, [0, 1], [SCREEN_HEIGHT + 50, -100]) }],
    }));
    const size = useMemo(() => Math.random() * 40 + 10, []);
    const left = useMemo(() => Math.random() * SCREEN_WIDTH, []);
    return <Animated.View style={[styles.bubble, { width: size, height: size, left: left }, animatedStyle]} />;
};
const AnimatedBackground = () => {
    const bubbles = useMemo(() => Array.from({ length: 15 }).map((_, i) => <Bubble key={i} />), []);
    return <View style={StyleSheet.absoluteFillObject}>{bubbles}</View>;
};

// --- Data Types ---
interface PreGeneratedPieceData { id: string; assetUri: string; }
interface PreGeneratedLevel { gridSize: { rows: number; cols: number; }; imageAspectRatio: number; pieceSizeInImage: number; pieces: PreGeneratedPieceData[]; }
type PieceImageMap = { [key: string]: ImageSourcePropType };
interface PuzzlePiece extends PreGeneratedPieceData { trayScale: number; initialX: number; initialY: number; slot: { x: number; y: number; }; }
// --- Se revierte a pieceSize, ya que las piezas vuelven a ser lógicamente cuadradas ---
interface PuzzleState { pieces: PuzzlePiece[]; boardSize: { width: number; height: number; }; pieceSize: number; trayContentWidth?: number; }
interface CurrentLevelState { data: PreGeneratedLevel; images: { background: ImageSourcePropType; pieces: PieceImageMap; }; }

// --- Level Manifest (Simulated) ---
const PRE_GENERATED_LEVELS = {
    'mundo1_nivel1_2x3': {
        data: require('./assets/puzzles/mundo1/nivel1/data.json') as PreGeneratedLevel,
        images: {
            background: require('./assets/puzzles/mundo1/nivel1/background.png'),
            pieces: {
                'r0c0': require('./assets/puzzles/mundo1/nivel1/piece_r0c0.png'), 'r0c1': require('./assets-puzzles/mundo1/nivel1/piece_r0c1.png'),
                'r0c2': require('./assets/puzzles/mundo1/nivel1/piece_r0c2.png'), 'r1c0': require('./assets/puzzles/mundo1/nivel1/piece_r1c0.png'),
                'r1c1': require('./assets/puzzles/mundo1/nivel1/piece_r1c1.png'), 'r1c2': require('./assets/puzzles/mundo1/nivel1/piece_r1c2.png'),
            } as PieceImageMap,
        }
    },
};

// --- Types and Constants ---
type GameState = 'LOADING' | 'PLAYING' | 'WON';
const BOARD_MARGIN = 10;
const SNAP_THRESHOLD = 50;
const PIECE_ASSET_TO_LOGICAL_RATIO = 1.5;
const BOARD_FRAME_WIDTH = 4;

interface DraggablePieceRef { reset: () => void; }

// --- Draggable Piece Component ---
const DraggablePiece = forwardRef<DraggablePieceRef, { pieceData: PuzzlePiece; onSnap: (id: string) => void; boardPosition: { x: number, y: number }, puzzleLayout: PuzzleState; images: PieceImageMap; trayScrollX: SharedValue<number> }>(({ pieceData, onSnap, boardPosition, puzzleLayout, images, trayScrollX }, ref) => {
    const isDragging = useSharedValue(false);
    const isSnapped = useSharedValue(false);
    const offsetX = useSharedValue(pieceData.initialX);
    const offsetY = useSharedValue(pieceData.initialY);
    const contextX = useSharedValue(0);
    const contextY = useSharedValue(0);
    const scale = useSharedValue(pieceData.trayScale);

    const pieceLogicalSize = puzzleLayout.pieceSize;
    const pieceVisualSize = pieceLogicalSize * PIECE_ASSET_TO_LOGICAL_RATIO;
    const visualOffset = (pieceVisualSize - pieceLogicalSize) / 2;

    useImperativeHandle(ref, () => ({ reset: () => { 'worklet'; offsetX.value = withSpring(pieceData.initialX); offsetY.value = withSpring(pieceData.initialY); isSnapped.value = false; scale.value = withSpring(pieceData.trayScale); } }));

    const panGesture = Gesture.Pan()
        .onStart(() => { if (isSnapped.value) return; contextX.value = offsetX.value - (pieceData.trayScale < 1 ? trayScrollX.value : 0); contextY.value = offsetY.value; isDragging.value = true; scale.value = withSpring(1); })
        .onUpdate((event) => { if (isSnapped.value) return; offsetX.value = contextX.value + event.translationX; offsetY.value = contextY.value + event.translationY; })
        .onEnd(() => {
            const currentPieceCenterX = offsetX.value + pieceLogicalSize / 2;
            const currentPieceCenterY = offsetY.value + pieceLogicalSize / 2;
            
            const targetSlotCenterX = boardPosition.x + pieceData.slot.x + pieceLogicalSize / 2;
            const targetSlotCenterY = boardPosition.y + pieceData.slot.y + pieceLogicalSize / 2;
            const distance = Math.sqrt(Math.pow(currentPieceCenterX - targetSlotCenterX, 2) + Math.pow(currentPieceCenterY - targetSlotCenterY, 2));

            if (distance < SNAP_THRESHOLD) {
                const finalX = boardPosition.x + pieceData.slot.x;
                const finalY = boardPosition.y + pieceData.slot.y;
                offsetX.value = withSpring(finalX);
                offsetY.value = withSpring(finalY);
                isSnapped.value = true;
                runOnJS(onSnap)(pieceData.id);
            } else {
                offsetX.value = withSpring(pieceData.initialX);
                offsetY.value = withSpring(pieceData.initialY);
                scale.value = withSpring(pieceData.trayScale);
            }
        })
        .onFinalize(() => { isDragging.value = false; });

    const animatedStyle = useAnimatedStyle(() => {
        const pieceTranslateX = isSnapped.value || isDragging.value || pieceData.trayScale === 1 ? offsetX.value : offsetX.value - trayScrollX.value;
        return {
            position: 'absolute',
            width: pieceLogicalSize,
            height: pieceLogicalSize,
            transform: [{ translateX: pieceTranslateX }, { translateY: offsetY.value }, { scale: scale.value * (isDragging.value ? 1.1 : 1) }],
            zIndex: isDragging.value ? 100 : (isSnapped.value ? 10 : 1),
            overflow: 'visible',
        };
    });

    return (
        <GestureDetector gesture={panGesture}>
            <Animated.View style={animatedStyle}>
                <RNImage 
                    source={images[pieceData.id]} 
                    style={{ 
                        width: pieceVisualSize, 
                        height: pieceVisualSize,
                        transform: [{translateX: -visualOffset}, {translateY: -visualOffset}]
                    }} 
                />
            </Animated.View>
        </GestureDetector>
    );
});

// --- Main App Component ---
const App = () => {
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [currentLevel, setCurrentLevel] = useState<CurrentLevelState | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleState | null>(null);
  const [snappedPieces, setSnappedPieces] = useState<Set<string>>(new Set());
  const [gameAreaLayout, setGameAreaLayout] = useState<{width: number, height: number, x: number, y: number} | null>(null);
  const pieceRefs = useMemo(() => puzzle ? puzzle.pieces.map(() => createRef<DraggablePieceRef>()) : [], [puzzle]);
  const trayScrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({ onScroll: (event) => { trayScrollX.value = event.contentOffset.x; }, });
  
  const setupPuzzle = useCallback((levelId: keyof typeof PRE_GENERATED_LEVELS) => {
    if (!gameAreaLayout) return;
    setGameState('LOADING');
    
    const viewWidth = gameAreaLayout.width;
    const viewHeight = gameAreaLayout.height;
    const level = PRE_GENERATED_LEVELS[levelId];
    setCurrentLevel(level);
    
    const { imageAspectRatio, gridSize, pieces } = level.data;

    const trayHeight = viewHeight * 0.25;

    const puzzleAreaWidth = viewWidth - (BOARD_MARGIN * 2) - (BOARD_FRAME_WIDTH * 2);
    const puzzleAreaHeight = viewHeight - trayHeight - (BOARD_MARGIN * 2) - (BOARD_FRAME_WIDTH * 2);

    let boardHeight = puzzleAreaHeight;
    let boardWidth = boardHeight * imageAspectRatio;

    if (boardWidth > puzzleAreaWidth) {
        boardWidth = puzzleAreaWidth;
        boardHeight = boardWidth / imageAspectRatio;
    }
    
    // --- LÓGICA SIMPLIFICADA ---
    // Esta lógica ahora es correcta porque el 'imageAspectRatio' del JSON
    // ya coincide con el aspect ratio de la cuadrícula (cols/rows).
    const pieceSize = boardWidth / gridSize.cols;

    // Ya no es necesario recalcular boardWidth y boardHeight, porque la proporción ya es correcta.
    // boardWidth = pieceSize * gridSize.cols;
    // boardHeight = pieceSize * gridSize.rows;

    const trayScale = (trayHeight * 0.8) / (pieceSize * PIECE_ASSET_TO_LOGICAL_RATIO);
    const pieceInTraySize = pieceSize * PIECE_ASSET_TO_LOGICAL_RATIO * trayScale;
    const pieceSpacing = 10;
    
    const scaleCorrection = (pieceSize / 2) * (1 - trayScale);

    const pieceBlockWidth = (pieceInTraySize * pieces.length) + (pieceSpacing * (pieces.length - 1));
    let initialXOffset: number;
    let trayContentWidth: number;

    if (pieceBlockWidth < viewWidth) {
        initialXOffset = (viewWidth - pieceBlockWidth) / 2;
        trayContentWidth = viewWidth;
    } else {
        initialXOffset = BOARD_MARGIN;
        trayContentWidth = pieceBlockWidth + (BOARD_MARGIN * 2);
    }

    const puzzlePieces = pieces.map((p, index) => {
        const targetX = initialXOffset + (index * (pieceInTraySize + pieceSpacing));
        const targetY = viewHeight - trayHeight + (trayHeight - pieceInTraySize) / 2;
        const col = (p.id.charCodeAt(3) - '0'.charCodeAt(0));
        const row = (p.id.charCodeAt(1) - '0'.charCodeAt(0));
        return { 
            ...p, 
            trayScale, 
            initialX: targetX - scaleCorrection, 
            initialY: targetY - scaleCorrection, 
            slot: { x: col * pieceSize, y: row * pieceSize } 
        };
    });

    setPuzzle({ pieces: puzzlePieces, boardSize: { width: boardWidth, height: boardHeight }, pieceSize, trayContentWidth });
    setSnappedPieces(new Set());
    setGameState('PLAYING');
  }, [gameAreaLayout]);

  useEffect(() => { if(gameAreaLayout){ setupPuzzle('mundo1_nivel1_2x3'); } }, [gameAreaLayout, setupPuzzle]);

  const handleSnap = useCallback((pieceId: string) => { 
      setSnappedPieces(prev => {
          const newSet = new Set(prev).add(pieceId);
          if (puzzle && newSet.size === puzzle.pieces.length) { setGameState('WON'); }
          return newSet;
      }); 
  }, [puzzle]);

  const handleReset = useCallback(() => {
    pieceRefs.forEach(ref => ref.current?.reset());
    setSnappedPieces(new Set());
    setGameState('PLAYING');
  }, [pieceRefs]);
  
  const gameLayout = gameAreaLayout ? gameAreaLayout : { width: 0, height: 0, x: 0, y: 0 };
  const boardSize = puzzle ? puzzle.boardSize : { width: 0, height: 0 };
  
  const frameWidth = boardSize.width + (BOARD_FRAME_WIDTH * 2);
  const frameHeight = boardSize.height + (BOARD_FRAME_WIDTH * 2);

  const frameX = (gameLayout.width - frameWidth) / 2;
  const frameY = BOARD_MARGIN;

  const boardX = frameX + BOARD_FRAME_WIDTH;
  const boardY = frameY + BOARD_FRAME_WIDTH;

  const boardPosition = { x: gameLayout.x + boardX, y: gameLayout.y + boardY };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <StatusBar hidden />
        <AnimatedBackground />

        {gameState === 'WON' && <ConfettiCannon count={200} origin={{x: gameLayout.width / 2, y: -10}} autoStart={true} fadeOut={true} />}
        
        <View style={styles.gameArea} onLayout={(e) => !gameAreaLayout && setGameAreaLayout(e.nativeEvent.layout)}>
            {puzzle && (
                <>
                    <View style={[styles.boardImageContainer, { width: boardSize.width, height: boardSize.height, top: boardY, left: boardX }]}>
                        <RNImage source={currentLevel!.images.background} style={styles.boardImage} />
                    </View>
                    
                    <View style={[styles.boardFrame, { width: frameWidth, height: frameHeight, top: frameY, left: frameX }]} />
                </>
            )}
        </View>

        {puzzle && puzzle.pieces.map((p) => {
            const originalIndex = puzzle.pieces.findIndex(origP => origP.id === p.id);
            if (snappedPieces.has(p.id)) {
                const pieceLogicalSize = puzzle.pieceSize;
                const pieceVisualSize = pieceLogicalSize * PIECE_ASSET_TO_LOGICAL_RATIO;
                const visualOffset = (pieceVisualSize - pieceLogicalSize) / 2;
                const finalX = boardPosition.x + p.slot.x;
                const finalY = boardPosition.y + p.slot.y;
                return (
                    <View key={p.id} style={[styles.staticPiece, { width: pieceLogicalSize, height: pieceLogicalSize, transform: [{translateX: finalX}, {translateY: finalY}] }]}>
                        <RNImage 
                            source={currentLevel!.images.pieces[p.id]} 
                            style={{
                                width: pieceVisualSize, 
                                height: pieceVisualSize,
                                transform: [{translateX: -visualOffset}, {translateY: -visualOffset}]
                            }} 
                        />
                    </View>
                );
            }
            return <DraggablePiece ref={pieceRefs[originalIndex]} key={p.id} pieceData={p} onSnap={handleSnap} boardPosition={boardPosition} puzzleLayout={puzzle} images={currentLevel!.images.pieces} trayScrollX={trayScrollX} />;
        })}
        
        {puzzle && (
            <Animated.ScrollView horizontal onScroll={scrollHandler} scrollEventThrottle={16} style={[styles.trayScrollView, {height: gameLayout.height * 0.25}]} contentContainerStyle={{ width: puzzle.trayContentWidth }} showsHorizontalScrollIndicator={false} />
        )}
        
        {gameState === 'WON' && (
            <View style={styles.winOverlay}>
                <View style={styles.winContainer}>
                    <Text style={styles.winText}>¡Felicidades!</Text>
                    <Button title="Resetear" onPress={handleReset} />
                </View>
            </View>
        )}

        {gameState === 'LOADING' && (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
        )}

      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#023047' },
  bubble: { position: 'absolute', backgroundColor: 'rgba(135, 206, 235, 0.4)', borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  gameArea: { flex: 1 },
  boardImageContainer: {
    position: 'absolute',
    borderRadius: 8,
    overflow: 'hidden',
  },
  boardImage: { 
    width: '100%', 
    height: '100%', 
    opacity: 0.3,
  },
  boardFrame: {
    position: 'absolute',
    borderWidth: BOARD_FRAME_WIDTH,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 12,
    pointerEvents: 'none',
  },
  staticPiece: { 
    position: 'absolute', 
    zIndex: 5,
    overflow: 'visible',
  },
  trayScrollView: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  winOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  winContainer: { padding: 20, backgroundColor: '#2c3e50', borderRadius: 10, alignItems: 'center' },
  winText: { color: 'white', fontSize: 32, fontWeight: 'bold', marginBottom: 20 },
  loadingContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(2, 48, 71, 0.9)', zIndex: 999 },
});

export default App;

