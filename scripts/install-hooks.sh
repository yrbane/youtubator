#!/usr/bin/env bash
# Installe les hooks git versionnés du dépôt (.githooks/) : voir docs/GUIDELINES.md §5.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
echo "✔ hooks installés (core.hooksPath = .githooks)"
