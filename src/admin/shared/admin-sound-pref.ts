// Admin sound preference: opslaan in localStorage + cross-tab sync via storage event.
import { useEffect, useState } from "react"

const STORAGE_KEY = "admin-alerts:sound-enabled"
const EVENT_NAME = "admin-alerts:sound-changed"

export function getSoundEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    // Default = aan
    return v === null ? true : v === "1"
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0")
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: enabled }))
  } catch {
    // ignore
  }
}

/**
 * React hook: leest huidige voorkeur en luistert naar wijzigingen
 * (zowel in deze tab als andere tabs).
 */
export function useSoundEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(true)

  useEffect(() => {
    setEnabledState(getSoundEnabled())
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail
      if (typeof detail === "boolean") setEnabledState(detail)
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(getSoundEnabled())
    }
    window.addEventListener(EVENT_NAME, onCustom)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return [enabled, setSoundEnabled]
}
