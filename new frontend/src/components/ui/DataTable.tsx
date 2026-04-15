import type { ReactNode } from "react";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}

interface DataTableProps<Row> {
  rows: Row[];
  columns: Array<DataTableColumn<Row>>;
  emptyMessage: string;
}

export function DataTable<Row>({
  rows,
  columns,
  emptyMessage,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    return <p className="muted-copy">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
