import React, { useState, useCallback, useRef, createRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, StatusBar, Button, LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

// --- Tipos para nuestro juego ---
interface Piece {
  id: string; // El id ahora une la pieza con su slot
  color: string;
  initialX: number;
  initialY: number;
}

interface Slot {
  id: string; // El id ahora une el slot con su pieza
  x: number;
  y: number;
}

// --- Configuración del Rompecabezas ---
const PIECE_SIZE = 80;
const BOARD_MARGIN = 20;
const SNAP_THRESHOLD = 50;

const PIECES: Piece[] = [
  { id: 'p1', color: '#f5a623', initialX: 50, initialY: 400 },
  { id: 'p2', color: '#4a90e2', initialX: 150, initialY: 400 },
  { id: 'p3', color: '#7ed321', initialX: 50, initialY: 500 },
  { id: 'p4', color: '#d0021b', initialX: 150, initialY: 500 },
];

const SLOTS: Slot[] = [
  { id: 'p3', x: BOARD_MARGIN, y: BOARD_MARGIN + PIECE_SIZE }, // Corresponde a la pieza verde
  { id: 'p1', x: BOARD_MARGIN, y: BOARD_MARGIN }, // Corresponde a la pieza naranja
  { id: 'p4', x: BOARD_MARGIN + PIECE_SIZE, y: BOARD_MARGIN + PIECE_SIZE }, // Corresponde a la pieza roja
  { id: 'p2', x: BOARD_MARGIN + PIECE_SIZE, y: BOARD_MARGIN }, // Corresponde a la pieza azul
];

const playSound = (soundName: 'snap-correct' | 'snap-wrong') => {
  console.log(`Reproduciendo sonido: ${soundName}`);
};

// --- Tipos para la Ref del Componente ---
interface DraggablePieceRef {
  reset: () => void;
}

// --- Componente de Pieza Arrastrable ---
const DraggablePiece = forwardRef<DraggablePieceRef, { piece: Piece, targetSlot: Slot, onSnap: (pieceId: string) => void, boardLayout: { x: number, y: number } | null }>(({ piece, targetSlot, onSnap, boardLayout }, ref) => {
  const { color } = piece;
  
  const isDragging = useSharedValue(false);
  const isSnapped = useSharedValue(false);

  const offsetX = useSharedValue(piece.initialX);
  const offsetY = useSharedValue(piece.initialY);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

  const resetPosition = useCallback(() => {
    'worklet';
    offsetX.value = withSpring(piece.initialX);
    offsetY.value = withSpring(piece.initialY);
    isSnapped.value = false;
  }, [piece.initialX, piece.initialY, offsetX, offsetY, isSnapped]);

  useImperativeHandle(ref, () => ({
    reset: resetPosition,
  }));

  const panGesture = Gesture.Pan()
    .onStart(() => {
      if (isSnapped.value) return;
      contextX.value = offsetX.value;
      contextY.value = offsetY.value;
      isDragging.value = true;
    })
    .onUpdate((event) => {
      if (isSnapped.value) return;
      offsetX.value = contextX.value + event.translationX;
      offsetY.value = contextY.value + event.translationY;
    })
    .onEnd(() => {
      if (!boardLayout) {
        offsetX.value = withSpring(piece.initialX);
        offsetY.value = withSpring(piece.initialY);
        return;
      }
      
      const absoluteTargetX = boardLayout.x + targetSlot.x;
      const absoluteTargetY = boardLayout.y + targetSlot.y;

      const distance = Math.sqrt(
        Math.pow(offsetX.value - absoluteTargetX, 2) +
        Math.pow(offsetY.value - absoluteTargetY, 2)
      );

      if (distance < SNAP_THRESHOLD) {
        offsetX.value = withSpring(absoluteTargetX);
        offsetY.value = withSpring(absoluteTargetY);
        isSnapped.value = true;
        runOnJS(onSnap)(piece.id);
        runOnJS(playSound)('snap-correct');
      } else {
        offsetX.value = withSpring(piece.initialX);
        offsetY.value = withSpring(piece.initialY);
        runOnJS(playSound)('snap-wrong');
      }
    })
    .onFinalize(() => {
      isDragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    
    // CORRECCIÓN: Usamos un borde animado en lugar de una sombra.
    const borderWidth = withSpring(isSnapped.value ? 4 : 0);

    return {
      width: PIECE_SIZE,
      height: PIECE_SIZE,
      borderRadius: 8,
      backgroundColor: color,
      position: 'absolute',
      transform: [
        { translateX: offsetX.value },
        { translateY: offsetY.value },
        { scale: withSpring(isDragging.value ? 1.2 : 1) },
      ],
      zIndex: isDragging.value ? 100 : (isSnapped.value ? 10 : 1),
      
      // Estilos para el nuevo resplandor con borde
      borderWidth: borderWidth,
      borderColor: color,
    };
  }, [color]);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle} />
    </GestureDetector>
  );
});

// --- Componente Principal de la App ---
const App = () => {
  const [snappedPieces, setSnappedPieces] = useState<Set<string>>(new Set());
  const [boardLayout, setBoardLayout] = useState<{ x: number, y: number } | null>(null);
  
  const pieceRefs = useRef(
    PIECES.map(() => createRef<DraggablePieceRef>())
  ).current;

  const handleSnap = useCallback((pieceId: string) => {
    setSnappedPieces(prev => new Set(prev).add(pieceId));
  }, []);

  const handleReset = () => {
    setSnappedPieces(new Set());
    pieceRefs.forEach(ref => {
        ref.current?.reset();
    });
  };
  
  const handleBoardLayout = (event: LayoutChangeEvent) => {
    const { x, y } = event.nativeEvent.layout;
    setBoardLayout({ x, y });
  };

  const hasWon = snappedPieces.size === PIECES.length;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
            <Text style={styles.title}>Rompecabezas 2D</Text>
            <Text style={styles.progressText}>
                Completado: {snappedPieces.size} / {PIECES.length}
            </Text>
        </View>
        
        <View style={styles.board} onLayout={handleBoardLayout}>
          {SLOTS.map(slot => (
            <View key={slot.id} style={[styles.slot, { top: slot.y, left: slot.x }]} />
          ))}
        </View>

        {boardLayout && PIECES.map((piece, index) => {
          const targetSlot = SLOTS.find(slot => slot.id === piece.id);
          if (!targetSlot) return null;

          return (
            <DraggablePiece 
                ref={pieceRefs[index]}
                key={piece.id} 
                piece={piece} 
                targetSlot={targetSlot}
                onSnap={handleSnap}
                boardLayout={boardLayout}
            />
          );
        })}

        {hasWon && (
            <View style={styles.winContainer}>
                <Text style={styles.winText}>¡Felicidades, has ganado!</Text>
            </View>
        )}
        
        <View style={styles.footer}>
            <Button title="Reiniciar Juego" onPress={handleReset} />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

// --- Estilos ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    paddingVertical: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
  },
  progressText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginTop: 5,
  },
  board: {
    width: PIECE_SIZE * 2 + BOARD_MARGIN * 2,
    height: PIECE_SIZE * 2 + BOARD_MARGIN * 2,
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 20,
  },
  slot: {
    width: PIECE_SIZE,
    height: PIECE_SIZE,
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#aaa',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  // La pieza ya no necesita estilos aquí, ya que se manejan en el useAnimatedStyle
  piece: {},
  footer: {
      position: 'absolute',
      bottom: 30,
      left: 0,
      right: 0,
      alignItems: 'center',
  },
  winContainer: {
    marginTop: 30,
    padding: 20,
    backgroundColor: '#7ed321',
    borderRadius: 10,
    alignSelf: 'center',
  },
  winText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  }
});

export default App;

