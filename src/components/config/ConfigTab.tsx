import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Configuration, Environment } from '@/types/api';
import { useStore } from '@/store/useStore';
import { 
  Plus, 
  Search, 
  Settings, 
  Download, 
  Upload, 
  Edit2, 
  Trash2, 
  Check, 
  X,
  Loader2,
  FileJson
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export const ConfigTab: React.FC<{ appSlug: string }> = ({ appSlug }) => {
  const { selectedEnvironmentSlug } = useStore();
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();

  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ['configurations', appSlug, selectedEnvironmentSlug],
    queryFn: async () => {
      const res = await api.get<Configuration[]>(`/applications/${appSlug}/configurations`, {
        params: { environmentSlug: selectedEnvironmentSlug }
      });
      return res.data;
    },
    enabled: !!selectedEnvironmentSlug,
  });

  const filteredConfigs = configs?.filter(c => 
    c.key.toLowerCase().includes(search.toLowerCase()) ||
    c.value.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    if (!configs || !selectedEnvironmentSlug) return;
    const exportData = configs.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appSlug}-${selectedEnvironmentSlug}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Configuration exported');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEnvironmentSlug) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        const promises = Object.entries(data).map(([key, value]) => 
          api.post(`/applications/${appSlug}/configurations`, {
            environmentSlug: selectedEnvironmentSlug,
            key,
            value: String(value),
            description: 'Imported configuration'
          })
        );

        await Promise.all(promises);
        queryClient.invalidateQueries({ queryKey: ['configurations', appSlug, selectedEnvironmentSlug] });
        toast.success(`Imported ${promises.length} configurations`);
      } catch (err) {
        toast.error('Failed to import JSON. Ensure it is a flat key-value object.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!deletingKey || !selectedEnvironmentSlug) return;
    try {
      await api.delete(`/applications/${appSlug}/configurations/${selectedEnvironmentSlug}/${deletingKey}`);
      queryClient.invalidateQueries({ queryKey: ['configurations', appSlug, selectedEnvironmentSlug] });
      toast.success('Configuration deleted');
    } catch (err) {
      toast.error('Failed to delete configuration');
    }
  };

  return (
    <div className="flex flex-col h-full uppercase">
      <div className="h-[48px] border-b border-border bg-[#121214] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-600" />
            <input 
              placeholder="Filter configs..." 
              className="w-full h-[28px] pl-8 pr-3 bg-zinc-900 border border-border text-xs focus:border-config transition-colors font-sans lowercase"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".json"
            onChange={handleImport}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="h-[28px] px-3 border border-border text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            Import
          </button>
          <button 
            onClick={handleExport}
            className="h-[28px] px-3 border border-border text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            Export
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="h-[28px] px-3 bg-config text-black hover:bg-config/90 font-bold uppercase tracking-tight text-[10px] transition-colors"
          >
            + Add Config
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-area">
        {!selectedEnvironmentSlug ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full opacity-50">
            <h3 className="text-lg font-bold tracking-tight uppercase">No Env Selected</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1 font-sans">Toggle environment in header</p>
          </div>
        ) : configsLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono">Syncing Registry...</span>
          </div>
        ) : (
          <div className="p-0">
            <Table>
              <TableHeader className="bg-zinc-900/50">
                <TableRow className="hover:bg-transparent border-zinc-800 h-10">
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 pl-6">Key Mapping</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Literal Value</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hidden lg:table-cell">Context</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 hidden xl:table-cell">Timestamp</TableHead>
                  <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest text-zinc-500 pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAdding && (
                  <ConfigRow 
                    appSlug={appSlug} 
                    envSlug={selectedEnvironmentSlug} 
                    onCancel={() => setIsAdding(false)} 
                    onSave={() => setIsAdding(false)} 
                  />
                )}
                {filteredConfigs?.length === 0 && !isAdding ? (
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell colSpan={5} className="p-12 text-center text-muted-foreground">
                      <FileJson className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-700">Empty Environment Configuration</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredConfigs?.map((config) => (
                    editingKey === config.key ? (
                      <ConfigRow 
                        key={config.key}
                        appSlug={appSlug} 
                        envSlug={selectedEnvironmentSlug} 
                        initialData={config}
                        onCancel={() => setEditingKey(null)} 
                        onSave={() => setEditingKey(null)} 
                      />
                    ) : (
                      <TableRow key={config.key} className="group border-zinc-900/50 hover:bg-zinc-900/20 h-12 transition-colors">
                        <TableCell className="font-mono text-[13px] font-bold text-config pl-6 uppercase tracking-tight">{config.key}</TableCell>
                        <TableCell className="font-mono text-xs text-zinc-300">{config.value}</TableCell>
                        <TableCell className="text-xs text-zinc-500 hidden lg:table-cell font-sans lowercase">{config.description}</TableCell>
                        <TableCell className="text-[9px] font-mono text-zinc-600 hidden xl:table-cell">
                          {format(new Date(config.updatedAt), 'yyyy-MM-dd HH:mm')}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end gap-2 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              className="text-zinc-500 hover:text-config transition-colors"
                              onClick={() => setEditingKey(config.key)}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              className="text-zinc-700 hover:text-destructive transition-colors"
                              onClick={() => setDeletingKey(config.key)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ConfirmationModal 
        open={!!deletingKey}
        onOpenChange={(open) => !open && setDeletingKey(null)}
        onConfirm={handleDelete}
        title="Delete Configuration"
        description={`Are you sure you want to delete the configuration key "${deletingKey}" from ${selectedEnvironmentSlug}?`}
        confirmText="Remove Entry"
        variant="destructive"
      />
    </div>
  );
};

interface ConfigRowProps {
  appSlug: string;
  envSlug: string;
  initialData?: Configuration;
  onCancel: () => void;
  onSave: () => void;
}

const ConfigRow: React.FC<ConfigRowProps> = ({ appSlug, envSlug, initialData, onCancel, onSave }) => {
  const [key, setKey] = useState(initialData?.key || '');
  const [value, setValue] = useState(initialData?.value || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (!key.trim() || !value.trim()) {
      toast.error('Key and value are required');
      return;
    }

    setLoading(true);
    try {
      if (initialData) {
        await api.put(`/applications/${appSlug}/configurations/${envSlug}/${key}`, {
          value,
          description
        });
      } else {
        await api.post(`/applications/${appSlug}/configurations`, {
          environmentSlug: envSlug,
          key,
          value,
          description
        });
      }
      queryClient.invalidateQueries({ queryKey: ['configurations', appSlug, envSlug] });
      toast.success(initialData ? 'Configuration updated' : 'Configuration added');
      onSave();
    } catch (err) {
      toast.error('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TableRow className="bg-config/5 border-config/20 border-x-2 border-x-config/30">
      <TableCell className="py-2">
        <Input 
          placeholder="CONFIG_KEY" 
          value={key} 
          onChange={(e) => setKey(e.target.value)}
          className="h-8 font-mono text-xs border-border bg-card focus-visible:ring-config"
          readOnly={!!initialData}
          autoFocus={!initialData}
        />
      </TableCell>
      <TableCell className="py-2">
        <Input 
          placeholder="Value" 
          value={value} 
          onChange={(e) => setValue(e.target.value)}
          className="h-8 font-mono text-xs border-border bg-card focus-visible:ring-config"
          autoFocus={!!initialData}
        />
      </TableCell>
      <TableCell className="py-2 hidden lg:table-cell">
        <Input 
          placeholder="Description" 
          value={description} 
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 text-[11px] border-border bg-card focus-visible:ring-config"
        />
      </TableCell>
      <TableCell className="py-2 hidden xl:table-cell"></TableCell>
      <TableCell className="py-2 text-right">
        <div className="flex justify-end gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            disabled={loading}
            className="h-8 w-8 hover:bg-red-500/10 text-destructive"
            onClick={onCancel}
          >
            <X className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            disabled={loading}
            className="h-8 w-8 hover:bg-green-500/10 text-green-500"
            onClick={handleSave}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};
