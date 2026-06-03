import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from './input';
import { Button } from './button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './select';
import { Badge } from './badge';

interface AdminFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    dateFilter: string;
    onDateFilterChange: (value: string) => void;
    amountFilter: string;
    onAmountFilterChange: (value: string) => void;
    onClearFilters: () => void;
    activeFiltersCount: number;
}

export function AdminFilters({
    searchTerm,
    onSearchChange,
    dateFilter,
    onDateFilterChange,
    amountFilter,
    onAmountFilterChange,
    onClearFilters,
    activeFiltersCount,
}: AdminFiltersProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-cyan-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 text-cyan-600" />
                    <h3 className="font-semibold text-gray-900">Filtros</h3>
                    {activeFiltersCount > 0 && (
                        <Badge variant="secondary" className="bg-cyan-100 text-cyan-700">
                            {activeFiltersCount}
                        </Badge>
                    )}
                </div>
                {activeFiltersCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearFilters}
                        className="h-8 text-xs text-gray-600 hover:text-gray-900"
                    >
                        Limpiar
                    </Button>
                )}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    type="text"
                    placeholder="Buscar por concepto..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10 pr-10"
                />
                {searchTerm && (
                    <button
                        onClick={() => onSearchChange('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                        <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    </button>
                )}
            </div>

            {/* Date Filter */}
            <div>
                <label className="text-sm text-gray-600 mb-1 block">Período</label>
                <Select value={dateFilter} onValueChange={onDateFilterChange}>
                    <SelectTrigger>
                        <SelectValue placeholder="Todos los períodos" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los períodos</SelectItem>
                        <SelectItem value="today">Hoy</SelectItem>
                        <SelectItem value="week">Última semana</SelectItem>
                        <SelectItem value="month">Último mes</SelectItem>
                        <SelectItem value="3months">Últimos 3 meses</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Amount Filter */}
            <div>
                <label className="text-sm text-gray-600 mb-1 block">Monto</label>
                <Select value={amountFilter} onValueChange={onAmountFilterChange}>
                    <SelectTrigger>
                        <SelectValue placeholder="Todos los montos" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los montos</SelectItem>
                        <SelectItem value="0-5000">$0 - $5.000</SelectItem>
                        <SelectItem value="5000-10000">$5.000 - $10.000</SelectItem>
                        <SelectItem value="10000-20000">$10.000 - $20.000</SelectItem>
                        <SelectItem value="20000-50000">$20.000 - $50.000</SelectItem>
                        <SelectItem value="50000+">$50.000+</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
