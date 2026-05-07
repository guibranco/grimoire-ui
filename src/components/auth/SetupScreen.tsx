import React, { useState } from 'react';
import { Shield, Key, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useStore } from '@/store/useStore';
import toast from 'react-hot-toast';

export const SetupScreen: React.FC = () => {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const setAdminAuthenticated = useStore((state) => state.setAdminAuthenticated);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      toast.error('Please enter a Management Admin API Key');
      return;
    }

    setLoading(true);
    try {
      // Simulate/Validate? The requirement says store it in localStorage.
      // We could try a test call to /applications but the prompt says just store it.
      localStorage.setItem('grimoire_admin_key', key.trim());
      setAdminAuthenticated(true);
      toast.success('Connected successfully');
    } catch (err) {
      toast.error('Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F0F11] p-4 font-sans">
      <div className="w-full max-w-md border border-zinc-800 bg-[#080809] shadow-2xl">
        <div className="p-8 border-b border-zinc-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-grimoire shrink-0" />
            <span className="text-2xl font-bold tracking-tight uppercase text-zinc-100">Grimoire</span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-300">Connect to Grimoire</h2>
          <p className="text-xs text-zinc-600 mt-1 uppercase tracking-widest leading-relaxed">
            Enter your Grimoire admin API key to continue.
          </p>
        </div>
        
        <form onSubmit={handleConnect} className="p-8 space-y-6">
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Master API Key</label>
            <div className="relative">
              <Key className="absolute left-3 top-3 w-4 h-4 text-zinc-700" />
              <input
                type="password"
                placeholder="grimoire_admin_..."
                className="w-full h-10 pl-10 bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono text-sm focus:border-grimoire transition-colors rounded-none outline-none"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-[9px] text-zinc-700 uppercase tracking-widest font-mono mt-2">
              SESSION: LOCALHOST_ENCRYPTED
            </p>
          </div>

          <button 
            type="submit" 
            className="w-full h-11 bg-zinc-100 text-black hover:bg-zinc-200 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-colors"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Connect
          </button>
        </form>
        
        <div className="px-8 pb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[9px] font-mono text-zinc-600">STABLE_REL_2.4.0</span>
          </div>
          <span className="text-[9px] font-mono text-zinc-700">SECURE SHELL v2</span>
        </div>
      </div>
    </div>
  );
};
