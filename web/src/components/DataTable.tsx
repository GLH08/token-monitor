import { useState, type ReactNode } from 'react';
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import EmptyState from './EmptyState';
import { cn } from '../lib/cn';

interface DataTableProps<TData> {
    columns: ColumnDef<TData>[];
    data: TData[];
    loading?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    /** Optional toolbar slot above the table (filters, search, etc.). */
    toolbar?: ReactNode;
    /** When provided, a card list is rendered on mobile instead of the table. */
    renderMobileCard?: (row: TData) => ReactNode;
    /** When provided, desktop rows and mobile cards become clickable. */
    onRowClick?: (row: TData) => void;
    skeletonRows?: number;
    /** Enable click-to-sort column headers (TanStack getSortedRowModel). */
    enableSorting?: boolean;
    className?: string;
}

const SortIcon = ({ dir }: { dir: false | 'asc' | 'desc' }) => {
    if (dir === 'asc') return <ChevronUp className="h-3.5 w-3.5" />;
    if (dir === 'desc') return <ChevronDown className="h-3.5 w-3.5" />;
    return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
};

/**
 * Generic TanStack Table wrapper: desktop table on md+, optional mobile card
 * fallback, and skeleton/empty states. Pagination/filtering are owned by the
 * caller (URL state) and reflected in `data`. Pass `enableSorting` to make
 * column headers clickable sort toggles.
 */
function DataTable<TData>({
    columns,
    data,
    loading = false,
    emptyTitle,
    emptyDescription,
    toolbar,
    renderMobileCard,
    onRowClick,
    skeletonRows = 5,
    enableSorting = false,
    className,
}: DataTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        ...(enableSorting
            ? {
                  state: { sorting },
                  onSortingChange: setSorting,
                  getSortedRowModel: getSortedRowModel(),
              }
            : {}),
    });

    return (
        <div className={cn('space-y-4', className)}>
            {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}

            {/* Desktop table */}
            <div className="hidden md:block">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : enableSorting && header.column.getCanSort()
                                              ? (
                                                      <button
                                                          type="button"
                                                          className="inline-flex items-center gap-1 text-left font-medium text-muted-foreground hover:text-foreground"
                                                          onClick={header.column.getToggleSortingHandler()}
                                                      >
                                                          {flexRender(
                                                              header.column.columnDef.header,
                                                              header.getContext(),
                                                          )}
                                                          <SortIcon dir={header.column.getIsSorted()} />
                                                      </button>
                                                  )
                                              : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext(),
                                                )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                                <TableRow key={`skeleton-row-${rowIndex}`}>
                                    {columns.map((_, colIndex) => (
                                        <TableCell key={`skeleton-cell-${colIndex}`}>
                                            <Skeleton className="h-5 w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                                    className={onRowClick ? 'cursor-pointer' : undefined}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="p-0">
                                    <EmptyState title={emptyTitle} description={emptyDescription} />
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile card fallback */}
            {renderMobileCard ? (
                <div className="space-y-3 md:hidden">
                    {loading
                        ? Array.from({ length: skeletonRows }).map((_, index) => (
                              <Skeleton key={`skeleton-card-${index}`} className="h-24 w-full" />
                          ))
                        : data.length
                          ? data.map((row, index) => (
                                <div
                                    key={`card-${index}`}
                                    className={cn('rounded-xl border p-4', onRowClick && 'cursor-pointer')}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                >
                                    {renderMobileCard(row)}
                                </div>
                            ))
                          : <EmptyState title={emptyTitle} description={emptyDescription} />}
                </div>
            ) : null}
        </div>
    );
}

export default DataTable;
