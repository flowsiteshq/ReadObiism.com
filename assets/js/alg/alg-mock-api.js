/**
 * ALG Studio Engine - Offline Mock API & Storage Fallback Engine
 * 
 * Provides zero-backend simulation mode using LocalStorage data stores.
 * Enables 100% standalone UI component testing and offline prototyping.
 */

(function () {
  'use strict';

  class ALGMockApi {
    constructor() {
      this.storageKeyPrefix = 'alg_mock_';
      this.initDefaultSeedData();
    }

    /**
     * Seeds initial mock data if LocalStorage is empty
     */
    initDefaultSeedData() {
      if (!localStorage.getItem(this.storageKeyPrefix + 'leads')) {
        const defaultLeads = [
          { id: 1, name: "Alexander Wright", email: "alex.wright@acme.io", company: "Acme Corp", source: "Landing Page", status: "New", createdAt: "2026-09-15 10:30:00" },
          { id: 2, name: "Sophia Martinez", email: "sophia.m@fintech.dev", company: "Fintech Labs", source: "Google Ads", status: "Contacted", createdAt: "2026-09-14 14:15:00" },
          { id: 3, name: "Marcus Chen", email: "m.chen@hyperdrive.ai", company: "HyperDrive AI", source: "Organic Search", status: "Qualified", createdAt: "2026-09-13 09:45:00" },
          { id: 4, name: "Elena Rostova", email: "elena@vortex.cloud", company: "Vortex Cloud", source: "Referral", status: "Closed", createdAt: "2026-09-12 16:20:00" }
        ];
        localStorage.setItem(this.storageKeyPrefix + 'leads', JSON.stringify(defaultLeads));
      }

      if (!localStorage.getItem(this.storageKeyPrefix + 'stats')) {
        const defaultStats = {
          totalUsers: 24580,
          monthlyRevenue: 48250.00,
          activeProjects: 18,
          conversionRate: 14.8
        };
        localStorage.setItem(this.storageKeyPrefix + 'stats', JSON.stringify(defaultStats));
      }
    }

    /**
     * Gets leads mock data
     */
    async getLeads() {
      await this.simulateDelay();
      const raw = localStorage.getItem(this.storageKeyPrefix + 'leads');
      return {
        success: true,
        data: raw ? JSON.parse(raw) : [],
        message: "Fetched leads from mock storage",
        timestamp: new Date().toISOString()
      };
    }

    /**
     * Creates a new lead in mock storage
     */
    async createLead(payload) {
      await this.simulateDelay();
      const leads = JSON.parse(localStorage.getItem(this.storageKeyPrefix + 'leads') || '[]');
      const newLead = {
        id: Date.now(),
        name: payload.name || "Anonymous Lead",
        email: payload.email || "no-email@example.com",
        company: payload.company || "N/A",
        source: payload.source || "Web Direct",
        status: "New",
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
      leads.unshift(newLead);
      localStorage.setItem(this.storageKeyPrefix + 'leads', JSON.stringify(leads));
      return {
        success: true,
        data: newLead,
        message: "Lead created in mock storage",
        timestamp: new Date().toISOString()
      };
    }

    /**
     * Gets system stats
     */
    async getStats() {
      await this.simulateDelay();
      const raw = localStorage.getItem(this.storageKeyPrefix + 'stats');
      return {
        success: true,
        data: raw ? JSON.parse(raw) : {},
        message: "Fetched stats from mock storage",
        timestamp: new Date().toISOString()
      };
    }

    /**
     * Simulates network latency (150ms - 350ms)
     */
    simulateDelay() {
      const ms = Math.floor(Math.random() * 200) + 150;
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // Attach to global facade
  window.ALG = window.ALG || {};
  window.ALG.MockApi = new ALGMockApi();

})();
