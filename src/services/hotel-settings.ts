import { supabase } from '@/lib/supabase'

export interface HotelSettings {
  id: string
  name: string
  address: string
  phone: string
  email: string
  website: string
  logoUrl?: string
  taxRate: number
  currency: string
  // Manager notification settings
  managerEmail?: string
  managerPhone?: string
  managerNotificationsEnabled?: boolean
  createdAt: string
  updatedAt: string
}

// Fallback settings for local development and uncharted domains
const FALLBACK_SETTINGS: HotelSettings = {
  id: 'local-dev-tenant',
  name: 'Local Demo Lodge',
  address: '123 Localhost St, Web, World',
  phone: '+1 234 567 8900',
  email: 'info@localhost',
  website: 'http://localhost',
  logoUrl: '/amp.png',
  taxRate: 0.10,
  currency: 'USD',
  managerEmail: 'admin@localhost',
  managerPhone: '+1 234 567 8900',
  managerNotificationsEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

export class HotelSettingsService {
  private static instance: HotelSettingsService
  private settings: HotelSettings | null = null

  static getInstance(): HotelSettingsService {
    if (!HotelSettingsService.instance) {
      HotelSettingsService.instance = new HotelSettingsService()
    }
    return HotelSettingsService.instance
  }

  async getHotelSettings(): Promise<HotelSettings> {
    // Return cached settings if available
    if (this.settings) {
      return this.settings
    }

    try {
      console.log('🏨 [HotelSettings] Fetching tenant configuration from Supabase...')
      const hostname = window.location.hostname
      
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('domain', hostname)
        .single()

      if (error || !data) {
        console.log(`⚠️ Tenants table missed domain '${hostname}', trying JWT tenant_id fallback...`)

        // Second attempt: use the authenticated user's app_metadata.tenant_id
        const { data: sessionData } = await supabase.auth.getSession()
        const tenantId = sessionData?.session?.user?.app_metadata?.tenant_id

        if (tenantId) {
          const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', tenantId)
            .single()

          if (!tenantError && tenantData) {
            this.settings = {
              id: tenantData.id,
              name: tenantData.name,
              address: tenantData.address || '',
              phone: tenantData.phone || '',
              email: tenantData.email || '',
              website: tenantData.domain,
              logoUrl: tenantData.logo_url,
              taxRate: tenantData.tax_rate || 0.10,
              currency: tenantData.currency || 'USD',
              managerEmail: tenantData.manager_email,
              managerPhone: tenantData.manager_phone,
              managerNotificationsEnabled: tenantData.manager_notifications_enabled !== false,
              createdAt: tenantData.created_at || new Date().toISOString(),
              updatedAt: tenantData.updated_at || new Date().toISOString()
            }
            console.log('✅ [HotelSettings] Loaded tenant via JWT fallback:', this.settings.name)
            return this.settings
          }
        }

        console.log('⚠️ [HotelSettings] JWT fallback also failed, using local fallback settings')
        this.settings = FALLBACK_SETTINGS
        return this.settings
      }

      this.settings = {
        id: data.id,
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.domain,
        logoUrl: data.logo_url,
        taxRate: data.tax_rate || 0.10,
        currency: data.currency || 'USD',
        managerEmail: data.manager_email,
        managerPhone: data.manager_phone,
        managerNotificationsEnabled: data.manager_notifications_enabled !== false,
        createdAt: data.created_at || new Date().toISOString(),
        updatedAt: data.updated_at || new Date().toISOString()
      }
      
      console.log('✅ [HotelSettings] Loaded tenant:', this.settings.name)
      return this.settings
    } catch (error: any) {
      console.error('❌ [HotelSettings] Unexpected error fetching tenant settings:', error)
      this.settings = FALLBACK_SETTINGS
      return this.settings
    }
  }

  async updateHotelSettings(updates: Partial<HotelSettings>): Promise<HotelSettings> {
    try {
      console.log('🏨 [HotelSettings] Updating tenant settings...', updates)

      const currentSettings = await this.getHotelSettings()
      
      if (currentSettings.id === 'local-dev-tenant') {
        console.warn('⚠️ [HotelSettings] Cannot update fallback settings.')
        this.settings = { ...currentSettings, ...updates }
        return this.settings
      }

      const { error } = await supabase
        .from('tenants')
        .update({
          name: updates.name,
          address: updates.address,
          phone: updates.phone,
          email: updates.email,
          logo_url: updates.logoUrl,
          tax_rate: updates.taxRate,
          currency: updates.currency,
          manager_email: updates.managerEmail,
          manager_phone: updates.managerPhone,
          manager_notifications_enabled: updates.managerNotificationsEnabled
        })
        .eq('id', currentSettings.id)

      if (error) throw error

      this.settings = {
        ...currentSettings,
        ...updates,
        updatedAt: new Date().toISOString()
      }

      console.log('✅ [HotelSettings] Settings updated successfully')
      return this.settings

    } catch (error: any) {
      console.error('❌ [HotelSettings] Failed to update settings:', error)
      throw new Error(`Failed to update settings: ${error.message}`)
    }
  }

  async refreshSettings(): Promise<void> {
    this.settings = null
    await this.getHotelSettings()
  }

  getCachedSettings(): HotelSettings | null {
    return this.settings
  }
}

// Export singleton instance
export const hotelSettingsService = HotelSettingsService.getInstance()
