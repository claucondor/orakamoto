# V3.1 Deployment Plan - Fix LP Token Accounting

## Problema Identificado

**Root Cause**: V2 y V3 comparten el mismo contrato `sip013-lp-token`, causando conflictos de market-id.

**Síntomas**:
- Market-id 1 en V2 y market-id 1 en V3 usan el mismo token-id en LP token
- LP tokens desaparecen o se corrompen
- Total supply existe pero balances individuales son 0
- ~6.5 USDC atrapados en contratos por accounting roto

**Evidencia**:
- Market 2 tiene 5 USDC total supply pero 0 balance para todos los usuarios
- Remove-liquidity falla porque LP accounting está roto
- Tests unitarios pasan porque simnet usa instancias locales separadas

## Solución: V3.1 con LP Token Dedicado

### Archivos Creados

1. **Contratos:**
   - `contracts/tokens/sip013-lp-token-v1-1.clar` - Copia del LP token original
   - `contracts/multi-market-pool-v3-1.clar` - Pool V3 usando `.sip013-lp-token-v1-1`

2. **Scripts de Deployment:**
   - `scripts/deploy-phase0-v3-1-testnet.sh` - Prepara para deployment
   - `scripts/restore-phase0-v3-1-contracts.sh` - Restaura después de deployment

3. **Deployment Plan:**
   - `deployments/phase0-v3-1.testnet-plan.yaml` - Plan de 2 batches

4. **Configuración:**
   - `Clarinet.toml` - Agregados `sip013-lp-token-v1-1` y `multi-market-pool-v3-1`

### Cambios en multi-market-pool-v3-1.clar

```clarity
;; Todas las referencias cambiadas de:
(contract-call? .sip013-lp-token ...)

;; A:
(contract-call? .sip013-lp-token-v1-1 ...)
```

**Funciones afectadas:**
- `get-lp-balance` (línea 314)
- `remove-liquidity` (línea 648, 821)
- `emergency-withdraw-lp` (línea 799)
- `create-market` (línea 953)
- `add-liquidity` (línea 1041)

## Deployment a Testnet

### Pre-requisitos (Ya Deployados)
- ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.sip013-semi-fungible-token-trait
- ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.math-fixed-point
- ST3TMC22Q2VGZA6T13TA5D1VMF3EW24R8J5G9ARFC.pm-amm-core-v2
- ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx

### Pasos

```bash
# 1. Preparar contratos (reemplaza .usdcx con testnet USDCx)
./scripts/deploy-phase0-v3-1-testnet.sh

# 2. Deploy a testnet
clarinet deployments apply -p deployments/phase0-v3-1.testnet-plan.yaml

# 3. Restaurar contratos originales
./scripts/restore-phase0-v3-1-contracts.sh
```

### Post-Deployment

**1. Autorizar minter (CRÍTICO):**
```clarity
;; Call desde deployer
(contract-call?
  .sip013-lp-token-v1-1
  set-authorized-minter
  .multi-market-pool-v3-1)
```

**2. Crear market de prueba:**
```clarity
(contract-call?
  .multi-market-pool-v3-1
  create-market
  "Will BTC reach $150k by end of 2026?"
  u<deadline>
  u<resolution-deadline>
  u1000000)  ;; 1 USDC initial liquidity
```

**3. Probar LP operations:**
```bash
# Add liquidity
node scripts/testnet-tests/test-add-liquidity.mjs

# Verificar LP balance
node scripts/testnet-tests/04-check-market.mjs

# Remove liquidity
node scripts/testnet-tests/test-remove-liquidity.mjs
```

## Tests de Validación

Tests creados en `tests/multi-market-pool-v3-liquidity.test.ts`:

✅ **11/11 tests passing:**
- Add liquidity (happy path, min check, resolved market)
- Remove liquidity (before/after resolve, fees, proportional, edge cases)
- Full lifecycle integration

**Ejecutar tests:**
```bash
npm test -- multi-market-pool-v3-liquidity.test.ts
```

## Estado Actual Testnet

**V2 (multi-market-pool-v2):**
- Balance: ? USDC
- Markets: 1-2 (compartiendo sip013-lp-token original)

**V3 (multi-market-pool-v3):**
- Balance: ~7.4 USDC
- Markets: 1-2 (compartiendo sip013-lp-token original)
- LP accounting ROTO por conflicto con V2

**V3.1 (multi-market-pool-v3-1):** ⬅️ NUEVO
- Balance: 0 USDC (fresh start)
- Markets: 0
- LP token: sip013-lp-token-v1-1 (dedicado, sin conflictos)

## Beneficios

1. **LP Token Accounting Correcto:**
   - Cada versión usa su propio LP token contract
   - No más conflictos de market-id entre versiones

2. **Fresh Start:**
   - V3.1 comienza limpio sin baggage de V2/V3
   - Más fácil debug y testing

3. **Backward Compatible:**
   - V2 y V3 siguen funcionando (aunque con accounting roto)
   - Usuarios pueden migrar gradualmente a V3.1

4. **Tests Completos:**
   - 11 tests cubren todo el flujo de liquidez
   - Previene regresiones futuras

## Próximos Pasos

1. ✅ Deploy V3.1 a testnet
2. ⬜ Autorizar minter en sip013-lp-token-v1-1
3. ⬜ Crear market de prueba
4. ⬜ Testear add/remove liquidity end-to-end
5. ⬜ Verificar LP accounting es correcto
6. ⬜ Si funciona, considerar migración de usuarios de V3 a V3.1

## Notas

- **Frontend**: Necesitará actualizar para usar `multi-market-pool-v3-1` y `sip013-lp-token-v1-1`
- **USDC Atrapado**: Los ~6.5 USDC en V2/V3 quedan ahí (necesita análisis separado para recuperar)
- **Migration Path**: Considerar herramienta para migrar LP positions de V3 a V3.1
