/** Small shared UI pieces: text, buttons, panels, steppers. */

import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { COLORS } from '../design/tokens';

export function Txt({
  children,
  size = 20,
  color = COLORS.text,
  weight = '500',
  align,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const base: TextStyle = {
    fontSize: size,
    color,
    fontWeight: weight,
    ...(align ? { textAlign: align } : {}),
  };
  return (
    <Text style={[base, style]} {...(numberOfLines ? { numberOfLines } : {})}>
      {children}
    </Text>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: COLORS.accent, fg: '#1b1405', border: COLORS.accent },
  secondary: { bg: COLORS.panel, fg: COLORS.text, border: COLORS.panelBorder },
  danger: { bg: COLORS.danger, fg: '#1f0905', border: COLORS.danger },
  ghost: { bg: 'transparent', fg: COLORS.text, border: COLORS.panelBorder },
};

export function Btn({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  width,
  size = 22,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  width?: number;
  size?: number;
  testID?: string;
}) {
  const v = VARIANT[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...(testID ? { testID } : {})}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border },
        width ? { width } : null,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={{ color: v.fg, fontSize: size, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

/** A − value + control for small integer settings. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Txt size={20} color={COLORS.textDim} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Btn
        label="−"
        variant="secondary"
        size={24}
        width={48}
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
      />
      <Txt size={26} weight="800" align="center" style={{ width: 44 }}>
        {value}
      </Txt>
      <Btn
        label="+"
        variant="secondary"
        size={24}
        width={48}
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
      />
    </View>
  );
}

/** Banner shown wherever the app is running the in-memory dev harness. */
export function DevBadge() {
  return (
    <View style={styles.dev}>
      <Txt size={13} weight="800" color="#1b1405">
        DEV HARNESS · local opponents, no network
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.97 }] },
  panel: {
    backgroundColor: COLORS.panel,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.panelBorder,
    padding: 24,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dev: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
});
