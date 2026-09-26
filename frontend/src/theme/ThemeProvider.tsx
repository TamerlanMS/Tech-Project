import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

const STORAGE_KEY = 'org-users.theme'

/**
 * Палитра «бумага и чернила»: тёплые нейтральные фоны, монохромные основные действия
 * и один сигнальный цвет (киноварь) для акцентов. Те же значения продублированы
 * CSS-переменными в styles.css — для собственной вёрстки вне antd.
 */
const PALETTE = {
  light: {
    bg: '#F3F1EB', surface: '#FBFAF6', surface2: '#EEEBE3', line: '#E2DDD1', lineStrong: '#CDC6B6',
    text: '#1C1A16', text2: '#5C574D', text3: '#8B8579', ink: '#1C1A16', onInk: '#FBFAF6',
    accent: '#C8431A', success: '#3D7A4C', warning: '#A96A12', danger: '#B3261E',
  },
  dark: {
    bg: '#12110F', surface: '#1A1916', surface2: '#24221E', line: '#2F2C27', lineStrong: '#433F38',
    text: '#EDE9E1', text2: '#AAA496', text3: '#7B7569', ink: '#EDE9E1', onInk: '#12110F',
    accent: '#FF7A4A', success: '#72C488', warning: '#E3AA52', danger: '#F2796B',
  },
} as const

function buildTheme(mode: Resolved): ThemeConfig {
  const p = PALETTE[mode]
  return {
    algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
      fontSize: 14,
      borderRadius: 6,
      borderRadiusLG: 8,
      borderRadiusSM: 4,
      colorPrimary: p.ink,
      colorInfo: p.ink,
      colorLink: p.accent,
      colorLinkHover: p.accent,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.danger,
      colorBgLayout: p.bg,
      colorBgContainer: p.surface,
      colorBgElevated: p.surface,
      colorBorder: p.lineStrong,
      colorBorderSecondary: p.line,
      colorSplit: p.line,
      colorText: p.text,
      colorTextSecondary: p.text2,
      colorTextTertiary: p.text3,
      colorTextQuaternary: p.text3,
      colorTextPlaceholder: p.text3,
      colorFillAlter: p.surface2,
      controlItemBgActive: p.surface2,
      controlItemBgHover: p.surface2,
      controlOutline: 'transparent',
      boxShadow: 'none',
      boxShadowSecondary: mode === 'dark' ? '0 8px 24px rgba(0,0,0,.5)' : '0 8px 24px rgba(40,32,16,.12)',
      motionDurationMid: '0.15s',
      wireframe: false,
    },
    components: {
      Button: {
        colorPrimary: p.ink,
        colorPrimaryHover: mode === 'dark' ? '#FFFFFF' : '#3A3730',
        colorPrimaryActive: mode === 'dark' ? '#D9D4CA' : '#000000',
        primaryColor: p.onInk, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', fontWeight: 500 },
      Table: {
        headerBg: p.surface,
        headerColor: p.text3,
        headerSplitColor: 'transparent',
        rowHoverBg: p.surface2,
        borderColor: p.line,
        headerSortActiveBg: p.surface,
        headerSortHoverBg: p.surface2,
        bodySortBg: 'transparent',
        cellPaddingBlock: 12,
      },
      Modal: { contentBg: p.surface, headerBg: p.surface },
      Drawer: { colorBgElevated: p.surface },
      Select: { optionSelectedBg: p.surface2, optionSelectedFontWeight: 500 },
      Segmented: { itemSelectedBg: p.surface, trackBg: p.surface2 },
    },
  }
}

interface ThemeCtx {
  mode: ThemeMode
  resolved: Resolved
  setMode: (m: ThemeMode) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored)
  const [systemDark, setSystemDark] = useState(() => media().matches)

  // «Системная» тема следит за настройкой ОС в реальном времени
  useEffect(() => {
    const mq = media()
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: Resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  const setMode = (m: ThemeMode) => {
    setModeState(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* private mode */
    }
  }

  const themeConfig = useMemo(() => buildTheme(resolved), [resolved])

  return (
    <Ctx.Provider value={{ mode, resolved, setMode }}>
      <ConfigProvider locale={ruRU} theme={themeConfig}>
        {children}
      </ConfigProvider>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTheme outside ThemeProvider')
  return c
}
