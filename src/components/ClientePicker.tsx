import { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Cliente } from "@/types/database";

interface ClientePickerProps {
  value: { cnpj: string; nome: string } | null;
  onChange: (cliente: { cnpj: string; nome: string } | null) => void;
}

export default function ClientePicker({ value, onChange }: ClientePickerProps) {
  const [query, setQuery] = useState(value?.nome || "");
  const [results, setResults] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim() || query === value?.nome) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("Clientes")
        .select("*")
        .or(`CLI_NOME.ilike.%${query}%,CLI_CNPJ.ilike.%${query}%,CLI_EMAIL.ilike.%${query}%`)
        .limit(10);
      setResults((data as Cliente[]) || []);
      setOpen(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Buscar cliente por nome, CNPJ ou email..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) onChange(null);
          }}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {value && (
        <p className="text-xs text-muted-foreground mt-1">
          CNPJ: {value.cnpj}
        </p>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.CLI_CNPJ}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between items-center"
              onClick={() => {
                onChange({ cnpj: c.CLI_CNPJ, nome: c.CLI_NOME || c.CLI_CNPJ });
                setQuery(c.CLI_NOME || c.CLI_CNPJ);
                setOpen(false);
              }}
            >
              <span className="font-medium truncate">{c.CLI_NOME || "Sem nome"}</span>
              <span className="text-xs text-muted-foreground ml-2 shrink-0">{c.CLI_CNPJ}</span>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !loading && query.trim() && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md p-3 text-sm text-muted-foreground text-center">
          Nenhum cliente encontrado
        </div>
      )}
    </div>
  );
}
