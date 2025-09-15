import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Image,
  useWindowDimensions,
  ImageSourcePropType,
  Text,
  TouchableOpacity,
  Vibration,
} from 'react-native';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  useAnimatedScrollHandler,
  SharedValue,
  withTiming,
  interpolate,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';

// --- (Carga de Assets: Dinámica) ---
import * as LevelAssets from './assets/puzzles/mundo1/nivel1/level.assets.js';

const puzzleData = LevelAssets.data;
const backgroundAsset = LevelAssets.background;
const assetMap: { [key: string]: ImageSourcePropType } = LevelAssets.pieces;

// --- (Definición de Tipos: Sin cambios) ---
interface PieceData {
  id: string;
  assetUri: string;
}
interface PieceDataWithLayout {
  id: string;
  assetSource: ImageSourcePropType;
  targetX: number;
  targetY: number;
  initialX: number;
  initialY: number;
}
interface BoardLayout {
  boardWidth: number;
  boardHeight: number;
  boardTop: number;
  boardLeft: number;
  pieceSizeOnScreen: number;
  pieceAssetRenderSize: number;
  stripTop: number;
  stripHeight: number;
  stripPieceSize: number;
  stripPieceAssetRenderSize: number;
}
const AnimatedScrollView = Animated.createAnimatedComponent(Animated.ScrollView);
const AnimatedImage = Animated.createAnimatedComponent(Image);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// --- (Función Shuffle: Sin cambios) ---
const shuffleArray = (array: any[]) => {
  let currentIndex = array.length,
    randomIndex;
  const newArray = [...array];
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex],
      newArray[currentIndex],
    ];
  }
  return newArray;
};

// --- (Componente PuzzlePiece: CON BUGFIX DEL REGRESO) ---
interface PuzzlePieceProps {
  piece: PieceDataWithLayout;
  isPlaced: boolean;
  layout: BoardLayout;
  scrollX: SharedValue<number>;
  onPiecePlaced: (id: string, targetX: number, targetY: number) => void;
  onGlowTrigger: (x: number, y: number) => void;
}
const PuzzlePiece: React.FC<PuzzlePieceProps> = ({
  piece,
  isPlaced,
  layout,
  scrollX,
  onPiecePlaced,
  onGlowTrigger,
}) => {
  const {
    id,
    assetSource, 
    targetX,
    targetY,
    initialX,
    initialY,
  } = piece;
  const { pieceSizeOnScreen, stripPieceSize } = layout;
  const stripScale = stripPieceSize / pieceSizeOnScreen;
  const SNAP_THRESHOLD = pieceSizeOnScreen * 0.35;
  const position = useSharedValue({ x: initialX, y: initialY });
  const scale = useSharedValue(stripScale);
  const zIndex = useSharedValue(isPlaced ? 1 : 10);
  const isDragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const rotate = useSharedValue('0deg');
  const glow = useSharedValue(0); 
  const isSnapped = useSharedValue(isPlaced);
  const shake = useSharedValue(0); 
  
  // --- BUGFIX DEL REGRESO: Nuevo estado para el "limbo" de regreso ---
  const isReturning = useSharedValue(false);

  useEffect(() => {
    if (isPlaced) {
      position.value = withSpring({ x: targetX, y: targetY });
      scale.value = withSpring(1.0);
      zIndex.value = 1;
      rotate.value = withSpring('0deg');
      isSnapped.value = true; 
    } else {
      // Si no estamos arrastrando Y no estamos volviendo... resetea
      if (!isDragging.value && !isReturning.value) {
        position.value = withSpring({ x: initialX, y: initialY });
        scale.value = withSpring(stripScale);
        zIndex.value = 10;
        rotate.value = withSpring('0deg');
        glow.value = withTiming(0);
        isSnapped.value = false; 
      }
    }
  }, [
    initialX,
    initialY,
    targetX,
    targetY,
    isPlaced,
    stripScale,
    position,
    scale,
    zIndex,
    isDragging,
    rotate,
    glow,
    isSnapped,
    isReturning, // <-- Añadir dependencia
  ]);

  const gesture = Gesture.Pan()
    .enabled(!isPlaced)
    .onStart(() => {
      'worklet';
      startX.value = position.value.x - scrollX.value;
      startY.value = position.value.y;
      isDragging.value = true;
      scale.value = withSpring(1.0);
      zIndex.value = 100;
      rotate.value = withSpring(Math.random() > 0.5 ? '4deg' : '-4deg');
    })
    .onUpdate((event) => {
      'worklet';
      position.value = {
        x: startX.value + event.translationX,
        y: startY.value + event.translationY,
      };
    })
    .onEnd((event) => {
      'worklet';
      isDragging.value = false;
      rotate.value = withSpring('0deg');
      
      const finalX = startX.value + event.translationX;
      const finalY = startY.value + event.translationY;
      const dist = Math.sqrt(
        Math.pow(finalX - targetX, 2) + Math.pow(finalY - targetY, 2),
      );
      if (dist < SNAP_THRESHOLD) {
        // ... (Lógica de Snap, sin cambios)
        isSnapped.value = true; 
        position.value = withSpring({ x: targetX, y: targetY });
        zIndex.value = 1;
        runOnJS(onPiecePlaced)(id, targetX, targetY);
        onGlowTrigger(targetX + layout.pieceAssetRenderSize / 2, targetY + layout.pieceAssetRenderSize / 2);

        scale.value = withSequence(
          withSpring(1.15, { stiffness: 400, damping: 15 }),
          withSpring(1.0, { stiffness: 200 }),
        );
         glow.value = withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(0, { duration: 300 })
        );
      } else {
        // --- BUGFIX DEL REGRESO (CON SINTAXIS CORREGIDA) ---
        runOnJS(Vibration.vibrate)(100);
        zIndex.value = 10;
        isReturning.value = true; // 1. Activa el modo "regresando"

        const SHAKE_AMOUNT = 10;
        const SHAKE_DURATION = 60;
        
        // 2. Tiembla EN EL LUGAR (posición absoluta 'finalX')
        position.value = withSequence(
          withTiming({ x: finalX - SHAKE_AMOUNT, y: finalY }, { duration: SHAKE_DURATION }),
          withTiming({ x: finalX + SHAKE_AMOUNT, y: finalY }, { duration: SHAKE_DURATION * 2 }),
          withTiming({ x: finalX - SHAKE_AMOUNT, y: finalY }, { duration: SHAKE_DURATION * 2 }),

        withTiming({ x: finalX, y: finalY }, { duration: SHAKE_DURATION }, () => {
              'worklet'; 
              const visualReturnX = initialX - scrollX.value;
              
              // 5. Anima al destino VISUAL
              position.value = withSpring(
                { x: visualReturnX, y: initialY }, 
                { damping: 15, stiffness: 120 },

                // --- CORRECCIÓN DE LINTER ---
                // Ahora usamos el argumento 'finished'
                (finished) => {
                  'worklet';
                  // Solo resetea el estado si la animación terminó con éxito
                  if (finished) { 
                   // --- CORRECCIÓN DE TIPO ---
                    // position.value debe ser un objeto {x, y}
                    position.value = { x: initialX, y: initialY };
                    // --- FIN DE CORRECCIÓN ---
                    isReturning.value = false;
                  }
                }
                // --- FIN DE LA CORRECCIÓN ---
              );
              // 9. Encoge la pieza AL MISMO TIEMPO
              scale.value = withSpring(stripScale);
            }) 
          ); 
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    // --- BUGFIX DEL REGRESO: Lógica de displayX actualizada ---
    // La pos es absoluta SI: arrastramos, está embonada, O está regresando.
    const displayX = 
      isDragging.value || isSnapped.value || isReturning.value
        ? position.value.x
        : position.value.x - scrollX.value;
    // --- FIN DEL BUGFIX ---
        
    const displayY = position.value.y;
    const shakeOffset = shake.value;

    return {
      position: 'absolute',
      width: layout.pieceAssetRenderSize,
      height: layout.pieceAssetRenderSize,
      zIndex: zIndex.value,
      transform: [
        { translateX: displayX },
        { translateY: displayY },
        { translateX: shakeOffset }, 
        { scale: scale.value },
        { rotate: rotate.value },
      ],
    };
  });

  const animatedGlowStyle = useAnimatedStyle(() => {
    const scale = interpolate(glow.value, [0, 0.5, 1], [0.8, 1.5, 1.8]);
    const opacity = interpolate(glow.value, [0, 0.5, 1], [0, 0.7, 0]); 
    return {
      opacity: opacity,
      transform: [{ scale: scale }],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>
        <Animated.View style={[styles.glow, animatedGlowStyle]} />
        <Image
          source={assetSource} 
          style={styles.pieceImage}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
};

// --- (Componente App: Sin cambios) ---
const App: React.FC = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth > 768;
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const stripScrollViewRef = useRef<Animated.ScrollView>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const boardLayout = useMemo((): BoardLayout => {
    const { gridSize, imageAspectRatio } = puzzleData;
    const stripHeight = isTablet ? 150 : 120;
    const boardPadding = 20;
    const availableHeight = screenHeight - stripHeight - boardPadding * 2;
    const availableWidth = screenWidth - boardPadding * 2;
    let boardWidth = availableWidth;
    let boardHeight = boardWidth / imageAspectRatio;
    if (boardHeight > availableHeight) {
      boardHeight = availableHeight;
      boardWidth = boardHeight * imageAspectRatio;
    }
    const boardTop = (availableHeight - boardHeight) / 2 + boardPadding;
    const boardLeft = (screenWidth - boardWidth) / 2;
    const pieceSizeOnScreen = boardWidth / gridSize.cols;
    const pieceAssetRenderSize = pieceSizeOnScreen * 1.5;
    const stripTop = screenHeight - stripHeight;
    const stripRenderedSizeFactor = isTablet ? 0.9 : 0.8;
    const stripPieceAssetRenderSize = stripHeight * stripRenderedSizeFactor;
    const stripPieceSize = stripPieceAssetRenderSize / 1.5;

    return {
      boardWidth,
      boardHeight,
      boardTop,
      boardLeft,
      pieceSizeOnScreen,
      pieceAssetRenderSize,
      stripTop,
      stripHeight,
      stripPieceSize,
      stripPieceAssetRenderSize,
    };
  }, [screenWidth, screenHeight, isTablet]);

  const pieceData = useMemo((): PieceDataWithLayout[] => {
    if (!boardLayout) return [];
    const pieceOffset = boardLayout.pieceSizeOnScreen * 0.25;
    const unscaledAssetSize = boardLayout.pieceAssetRenderSize;
    const scaledAssetSize = boardLayout.stripPieceAssetRenderSize;
    const stripCenterY = boardLayout.stripTop + boardLayout.stripHeight / 2;
    const initialY = stripCenterY - unscaledAssetSize / 2;
    const pieceSpacing = scaledAssetSize * 0.8 + 10;
    const shuffledPieces = shuffleArray(puzzleData.pieces);
    
    return shuffledPieces.map((p: PieceData, index: number) => {
      const { id, assetUri } = p;
      const [r, c] = id.replace('r', '').split('c').map(Number);
      const cellLeft = boardLayout.boardLeft + c * boardLayout.pieceSizeOnScreen;
      const cellTop = boardLayout.boardTop + r * boardLayout.pieceSizeOnScreen;
      const targetX = cellLeft - pieceOffset;
      const targetY = cellTop - pieceOffset;
      const pieceCenterInScroll = 10 + index * pieceSpacing + scaledAssetSize / 2;
      const initialX = pieceCenterInScroll - unscaledAssetSize / 2;
      return {
        id,
        assetSource: assetMap[assetUri], 
        targetX,
        targetY,
        initialX,
        initialY,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardLayout, shuffleSeed]);

  const [placedPieceIds, setPlacedPieceIds] = useState<Set<string>>(
    new Set(),
  );

  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const scaledAssetSize = boardLayout.stripPieceAssetRenderSize;
  const pieceSpacing = scaledAssetSize * 0.8 + 10;
  const stripContentWidth =
    pieceData.length > 0
      ? (pieceData.length - 1) * pieceSpacing + scaledAssetSize + 20
      : 0;

  const onPiecePlaced = (id: string) => {
    const newPlacedIds = new Set(placedPieceIds);
    newPlacedIds.add(id);
    setPlacedPieceIds(newPlacedIds);
    let nextUnplacedIndex = -1;
    for (let i = 0; i < pieceData.length; i++) {
      if (!newPlacedIds.has(pieceData[i].id)) {
        nextUnplacedIndex = i;
        break;
      }
    }
    if (nextUnplacedIndex !== -1) {
      const pieceCenterInScroll = 10 + nextUnplacedIndex * pieceSpacing + scaledAssetSize / 2;
      const screenCenter = screenWidth / 2;
      let newScrollX = pieceCenterInScroll - screenCenter;
      const maxScroll = stripContentWidth - screenWidth;
      if (newScrollX < 0) newScrollX = 0;
      if (newScrollX > maxScroll && maxScroll > 0) newScrollX = maxScroll;
      stripScrollViewRef.current?.scrollTo({ x: newScrollX, animated: true });
    }
  };

  const allPiecesPlaced = useMemo(
    () => (pieceData.length > 0 ? placedPieceIds.size === pieceData.length : false),
    [placedPieceIds, pieceData],
  );

  const winAnimation = useSharedValue(0);
  const backgroundOpacity = useSharedValue(0.3);
  const glowAnimation = useSharedValue(0);
  const glowAnimationX = useSharedValue(0);
  const glowAnimationY = useSharedValue(0);

  const handleGlowTrigger = (x: number, y: number) => {
    'worklet'; 
    glowAnimationX.value = x;
    glowAnimationY.value = y;
    glowAnimation.value = withSequence(
      withTiming(1, { duration: 400 }),
      withTiming(0, { duration: 400 })
    );
  };

  useEffect(() => {
    if (allPiecesPlaced) {
      const DELAY_MS = 500; 
      winAnimation.value = withDelay(DELAY_MS, withTiming(1, { duration: 600 }));
      backgroundOpacity.value = withDelay(DELAY_MS, withTiming(1.0, { duration: 1200 }));
      setTimeout(() => {
        setShowConfetti(true);
      }, DELAY_MS);

    } else {
      setShowConfetti(false);
    }
  }, [allPiecesPlaced, winAnimation, backgroundOpacity]);

  const handleResetLevel = () => {
    winAnimation.value = withTiming(0, { duration: 300 });
    setPlacedPieceIds(new Set());
    setShuffleSeed((s) => s + 1);
    backgroundOpacity.value = withTiming(0.3, { duration: 300 });
    glowAnimation.value = 0;
  };

  const animatedWinStyle = useAnimatedStyle(() => {
    const opacity = winAnimation.value;
    const translateY = interpolate(winAnimation.value, [0, 1], [30, 0]);
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: boardLayout.stripTop,
      height: boardLayout.stripHeight,
      opacity: opacity,
      pointerEvents: opacity === 0 ? 'none' : 'auto',
      transform: [{ translateY }],
      backgroundColor: 'rgba(26, 37, 47, 0.95)',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: isTablet ? 'row' : 'column',
    };
  });
  
  const animatedBackgroundStyle = useAnimatedStyle(() => {
    return {
      opacity: backgroundOpacity.value,
    };
  });

  const animatedMainGlowStyle = useAnimatedStyle(() => {
    const scale = interpolate(glowAnimation.value, [0, 1], [0.8, 1.8]);
    const opacity = interpolate(glowAnimation.value, [0, 0.5, 1], [0, 0.7, 0]);
    return {
      position: 'absolute',
      left: glowAnimationX.value - styles.mainGlow.width / 2, 
      top: glowAnimationY.value - styles.mainGlow.height / 2, 
      opacity: opacity,
      transform: [{ scale: scale }],
      zIndex: 999, 
    };
  });


  if (!boardLayout) {
    return <View style={styles.root} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* ... (Todo el JSX sin cambios) ... */}
      <View
        style={[
          styles.boardContainer,
          {
            width: boardLayout.boardWidth,
            height: boardLayout.boardHeight,
            top: boardLayout.boardTop,
            left: boardLayout.boardLeft,
          },
        ]}
      >
        <AnimatedImage
          source={backgroundAsset}
          style={[styles.boardBackground, animatedBackgroundStyle]}
          resizeMode="stretch"
        />
      </View>
      <AnimatedScrollView
        ref={stripScrollViewRef} 
        horizontal
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={[
          styles.stripContainer,
          {
            top: boardLayout.stripTop,
            height: boardLayout.stripHeight,
          },
        ]}
        contentContainerStyle={{ width: stripContentWidth }}
        showsHorizontalScrollIndicator={false}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {pieceData.map((piece) => (
          <PuzzlePiece
            key={piece.id}
            piece={piece}
            isPlaced={placedPieceIds.has(piece.id)}
            layout={boardLayout}
            scrollX={scrollX}
            onPiecePlaced={onPiecePlaced}
            onGlowTrigger={handleGlowTrigger} 
          />
        ))}
      </View>
      <Animated.View style={animatedMainGlowStyle}>
        <AnimatedLinearGradient
          colors={['#FFD700', 'rgba(255,215,0,0.5)', 'rgba(255,215,0,0)']}
          start={{ x: 0.5, y: 0.5 }} 
          end={{ x: 0.5, y: 1.0 }}
          style={styles.mainGlow}
        />
      </Animated.View>
      <Animated.View style={animatedWinStyle}>
        <Text style={styles.winTitle}>¡Felicidades!</Text>
        <View style={isTablet ? styles.buttonsRow : styles.buttonsColumn}>
          <TouchableOpacity
            style={[styles.winButton, styles.resetButton]}
            onPress={handleResetLevel}
          >
            <Text style={styles.winButtonText}>Reiniciar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.winButton}
            onPress={() => console.log('Ir al Siguiente Nivel')}
          >
            <Text style={styles.winButtonText}>Siguiente Nivel</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {showConfetti && (
        <ConfettiCannon
          count={200}
          origin={{ x: screenWidth / 2, y: -20 }}
          autoStart={true}
          explosionSpeed={400}
          fallSpeed={3000}
          fadeOut={true}
          // Quitamos el 'style' que daba error
        />
      )}

    </GestureHandlerRootView>
  );
};

// --- (Estilos: Sin cambios) ---
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#2c3e50',
  },
  boardContainer: {
    position: 'absolute',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  boardBackground: {
    width: '100%',
    height: '100%',
  },
  stripContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFD700',
    borderRadius: 20,
  },
  pieceImage: {
    width: '100%',
    height: '100%',
  },
  winTitle: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
    marginHorizontal: 20,
    textAlignVertical: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  buttonsColumn: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  winButton: {
    backgroundColor: '#3498db',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 10,
    marginTop: 8,
  },
  resetButton: {
    backgroundColor: '#95a5a6',
  },
  winButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  mainGlow: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
});

export default App;