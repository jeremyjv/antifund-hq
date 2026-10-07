# Worker

Keep this transport layer thin. Use the core store for all mutations. Public research and public MCP must never expose visitor records. Require owner-scoped queries, same-origin writes, and CSRF tokens. Never log cookies or credentials. Serve assets with security headers. Run the backend integration tests after API or migration changes.
