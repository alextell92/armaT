import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, StatusBar, Button } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  runOnUI,
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

// Las piezas y slots ahora comparten un 'id' para vincularlos
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
  // En una app real, aquí iría la lógica para reproducir un sonido.
  console.log(`Reproduciendo sonido: ${soundName}`);
};


// --- Componente de Pieza Arrastrable ---
// Le pasamos una función para notificar al padre cuando una pieza encaja
const DraggablePiece = ({ piece, targetSlot, onSnap }: { piece: Piece, targetSlot: Slot, onSnap: (pieceId: string) => void }) => {
  const isDragging = useSharedValue(false);
  const isSnapped = useSharedValue(false);

  const offsetX = useSharedValue(piece.initialX);
  const offsetY = useSharedValue(piece.initialY);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);

  // **MEJORA**: Creamos una función para reiniciar la posición que se puede llamar desde fuera
  const resetPosition = useCallback(() => {
    'worklet'; // Indicamos que esta función puede ejecutarse en el UI thread
    offsetX.value = withSpring(piece.initialX);
    offsetY.value = withSpring(piece.initialY);
    isSnapped.value = false;
  }, [piece, offsetX, offsetY, isSnapped]);
  
  // Hacemos la función accesible para el componente padre
  // (Esta es una forma avanzada, otra sería manejar el estado en el padre)
  piece.reset = resetPosition;


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
      const distance = Math.sqrt(
        Math.pow(offsetX.value - targetSlot.x, 2) +
        Math.pow(offsetY.value - targetSlot.y, 2)
      );

      // La lógica principal no cambia, pero ahora es más robusta
      if (distance < SNAP_THRESHOLD) {
        offsetX.value = withSpring(targetSlot.x);
        offsetY.value = withSpring(targetSlot.y);
        isSnapped.value = true;
        // Notificamos al componente padre que esta pieza ha encajado
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

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: withSpring(isDragging.value ? 1.2 : 1) },
    ],
    zIndex: isDragging.value ? 100 : isSnapped.value ? 1 : 10,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <View style={[styles.piece, { backgroundColor: piece.color }]} />
      </Animated.View>
    </GestureDetector>
  );
};

// --- Componente Principal de la App ---
const App = () => {
  // **MEJORA**: Estado para saber qué piezas ya están colocadas
  const [snappedPieces, setSnappedPieces] = useState<Set<string>>(new Set());
  
  // **MEJORA**: Función que se llama cuando una pieza encaja
  const handleSnap = useCallback((pieceId: string) => {
    setSnappedPieces(prev => new Set(prev).add(pieceId));
  }, []);

  // **MEJORA**: Lógica de reinicio
  const handleReset = () => {
    // Limpiamos el estado de las piezas encajadas
    setSnappedPieces(new Set());
    // Recorremos las piezas y llamamos a su función de reinicio
    PIECES.forEach(p => {
        if (p.reset) {
            runOnUI(p.reset)();
        }
    });
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
        
        <View style={styles.board}>
          {SLOTS.map(slot => (
            <View key={slot.id} style={[styles.slot, { top: slot.y, left: slot.x }]} />
          ))}
        </View>

        {PIECES.map(piece => {
          // **MEJORA**: Buscamos el slot correcto para esta pieza basándonos en el ID
          const targetSlot = SLOTS.find(slot => slot.id === piece.id);
          if (!targetSlot) return null; // No debería pasar si la configuración es correcta

          return (
            <DraggablePiece 
                key={piece.id} 
                piece={piece} 
                targetSlot={targetSlot}
                onSnap={handleSnap}
            />
          );
        })}

        {/* **MEJORA**: Mostramos un mensaje de victoria y el botón de reinicio */}
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
  piece: {
    width: PIECE_SIZE,
    height: PIECE_SIZE,
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
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
