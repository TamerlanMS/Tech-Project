import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Segmented, Tooltip } from 'antd'
import type { ReactNode } from 'react'
import { useTheme, type ThemeMode } from './ThemeProvider'

const OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Светлая', icon: <SunOutlined /> },
  { value: 'dark', label: 'Тёмная', icon: <MoonOutlined /> },
  { value: 'system', label: 'Как в системе', icon: <DesktopOutlined /> },
]

export default function ThemeSwitch({ block = false }: { block?: boolean }) {
  const { mode, setMode } = useTheme()
  return (
    <Segmented<ThemeMode>
      size="small"
      block={block}
      value={mode}
      onChange={setMode}
      aria-label="Тема интерфейса"
      options={OPTIONS.map((o) => ({
        value: o.value,
        label: <Tooltip title={o.label} mouseEnterDelay={0.4}><span aria-label={o.label}>{o.icon}</span></Tooltip>,
      }))}
    />
  )
}
