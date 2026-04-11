import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';

export interface BreadcrumbSegment {
  readonly label: string;
  readonly to?: string;
}

export function LocalLibraryBreadcrumb(props: {
  readonly segments: readonly BreadcrumbSegment[];
}): ReactElement {
  const { segments } = props;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {segments.map((seg, index) => {
        const isLast = index === segments.length - 1;
        const key = `${index}-${seg.label}-${seg.to ?? ''}`;
        return (
          <span key={key}>
            {index > 0 ? <span className="breadcrumb-sep"> › </span> : null}
            {seg.to !== undefined ? (
              <Link to={seg.to}>{seg.label}</Link>
            ) : (
              <span className={isLast ? 'breadcrumb-current' : undefined}>{seg.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
