.PHONY: test contracts app ci fmt

contracts:
	cd contracts && forge build && forge test

app:
	cd app && pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build

test: contracts
	cd app && pnpm test

# the same steps as .github/workflows/ci.yml
ci:
	cd contracts && forge fmt --check && forge build --sizes && FOUNDRY_PROFILE=ci forge test
	$(MAKE) app

fmt:
	cd contracts && forge fmt
	cd app && pnpm format
