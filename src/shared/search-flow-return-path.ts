/**
 * When the user explores Search → artist/album pages, we remember the last URL in this flow
 * so the main nav "Search" item can return them to the same breadcrumb depth (e.g. album
 * tracks), not only `/search` with the query restored.
 */
export const SEARCH_LAST_ROUTE_KEY = 'deepcut.search.lastRoute.v1';

export function isSearchFlowPathname(pathname: string): boolean {
  return (
    pathname === '/search' ||
    pathname.startsWith('/album/') ||
    pathname.startsWith('/artist/') ||
    pathname.startsWith('/local-album/') ||
    pathname.startsWith('/local-artist/')
  );
}
