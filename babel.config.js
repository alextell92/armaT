module.exports = {
  presets: ['module:@react-native/babel-preset'], // Tu preset está bien, pero en las nuevas versiones es mejor usar @react-native/babel-preset
  plugins: [
    'react-native-reanimated/plugin', // <-- ESTA ES LA LÍNEA CRUCIAL QUE FALTA
  ],
};