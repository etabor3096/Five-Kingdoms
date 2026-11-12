import { StyleSheet, View } from 'react-native';
import { Canvas } from '../components/Canvas';
import { Overlays } from '../components/Overlays';
import { Toast } from '../components/Toast';
import { selectScreen } from '../state/screens';
import { useSnapshot } from '../state/ClientContext';
import { useProfile } from '../state/useProfile';
import { LobbyScreen } from './LobbyScreen';
import { MenuScreen } from './MenuScreen';
import { ScoreboardScreen } from './ScoreboardScreen';
import { StandingsScreen } from './StandingsScreen';
import { TableScreen } from './TableScreen';

/** Chooses the screen from room and game state, all inside the scaled 16:9 canvas. */
export function AppFlow() {
  const { room, view, standingsOpen } = useSnapshot();
  const { profile, loaded, update } = useProfile();
  const screen = selectScreen(room, view, standingsOpen);
  return (
    <Canvas>
      <View style={StyleSheet.absoluteFill}>
        {screen === 'menu' && loaded && <MenuScreen profile={profile} onProfile={update} />}
        {screen === 'lobby' && <LobbyScreen />}
        {screen === 'table' && <TableScreen />}
        {screen === 'scoreboard' && <ScoreboardScreen />}
        {screen === 'standings' && <StandingsScreen />}
      </View>
      <Overlays />
      <Toast />
    </Canvas>
  );
}
