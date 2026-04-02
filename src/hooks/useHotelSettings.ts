import { useState, useEffect } from 'react'
import { hotelSettingsService, HotelSettings } from '@/services/hotel-settings'

export function useHotelSettings() {
    const [settings, setSettings] = useState<HotelSettings | null>(hotelSettingsService.getCachedSettings())
    const [loading, setLoading] = useState(!settings)

    useEffect(() => {
        let mounted = true
        const loadSettings = async () => {
            try {
                const s = await hotelSettingsService.getHotelSettings()
                if (mounted) {
                    setSettings(s)
                    setLoading(false)
                }
            } catch (err) {
                if (mounted) {
                    setLoading(false)
                }
            }
        }

        if (!settings) {
            loadSettings()
        }

        return () => {
            mounted = false
        }
    }, [settings])

    return {
        settings,
        loading,
        // Provide safe fallbacks so components don't crash while loading
        safeSettings: settings || {
            name: 'Loading...',
            phone: '',
            email: '',
            website: '',
            address: '',
            logoUrl: '/logo.png',
            currency: 'USD',
            taxRate: 0.10
        } as HotelSettings
    }
}
