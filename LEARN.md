# Anchor Dice Game - Complete Guide

## What Is This Project?

This i built using the **Anchor frams a **Dice Game on the Solana blockchain**,ework**. Think of it as a decentralized gambling game where a player bets SOL (Solana's cryptocurrency) on a dice roll, and the outcome is determined on-chain in a provably fair way.

---

## The Tech Stack

| Layer                    | Technology                                                    |
| ------------------------ | ------------------------------------------------------------- |
| Blockchain               | **Solana** (a fast, low-fee blockchain)                       |
| Smart Contract Framework | **Anchor** (v0.32.1) -- simplifies writing Solana programs    |
| On-chain code            | **Rust** -- the smart contract (called a "program" on Solana) |
| Tests                    | **TypeScript** with Mocha/Chai                                |
| Local dev tool           | **Surfpool** -- a local Solana simulator                      |
| Deployment               | **txtx runbooks** -- infrastructure-as-code for deploying     |

---

## How the Game Works (The Concept)

1. A **house** (the casino/operator) deposits SOL into a **vault** (a treasury account on-chain).
2. A **player** picks:
   - A **roll threshold** (a number between 2 and 96)
   - A **bet amount** (minimum 0.01 SOL)
3. The **house** signs a message with its Ed25519 private key. That signature is hashed to produce a **random number between 1-100**.
4. If the random number is **less than** the player's chosen threshold, the player **wins**. Otherwise, the house keeps the bet.
5. The payout is calculated inversely to the threshold:
   - **Higher threshold** = easier to win = **smaller payout**
   - **Lower threshold** = harder to win = **bigger payout**
   - A **1.5% house edge** is always taken.

### Example

If you pick roll threshold = 50, you have roughly a 49% chance of winning. The payout multiplier is approximately `(10000 - 150) / (50 - 1) / 100 = ~2.01x`. So betting 1 SOL, you'd win ~2.01 SOL.

---

## Project Structure

```
anchor-dice-game-starter-q4-25/
├── Anchor.toml                         # Anchor project config
├── Cargo.toml                          # Rust workspace config
├── package.json                        # Node.js dependencies for testing
├── rust-toolchain.toml                 # Pins Rust version
├── tsconfig.json                       # TypeScript config
├── txtx.yml                            # Surfpool environment config
├── migrations/
│   └── deploy.ts                       # Boilerplate deploy script
├── programs/
│   └── anchor-dice-game-q4-25/
│       ├── Cargo.toml                  # Program crate config
│       └── src/
│           ├── lib.rs                  # Program entrypoint
│           ├── errors.rs               # Custom error codes
│           ├── instructions/
│           │   ├── mod.rs              # Instruction module registry
│           │   ├── initialize.rs       # Fund the house vault
│           │   ├── place_bet.rs        # Player places a bet
│           │   ├── resolve_bet.rs      # Determine the winner
│           │   └── refund_bet.rs       # Refund a stale bet
│           └── state/
│               └── mod.rs              # Bet account data structure
├── tests/
│   └── anchor-dice-game-q4-25.ts       # TypeScript test suite
└── runbooks/
    ├── README.md                       # Surfpool docs
    └── deployment/
        ├── main.tx                     # Deploy action definition
        ├── signers.localnet.tx         # Local signer config
        ├── signers.devnet.tx           # Devnet signer config
        └── signers.mainnet.tx          # Mainnet signer config
```

---

## The Rust Smart Contract (Deep Dive)

The on-chain program lives in `programs/anchor-dice-game-q4-25/src/`. It defines 4 instructions (functions) that anyone can call on the Solana blockchain.

### `lib.rs` -- The Entry Point

Declares the program ID and wires up the four instructions:

- **`initialize(amount)`** -- House deposits SOL into the vault
- **`place_bet(seed, roll, amount)`** -- Player places a bet
- **`resolve_bet(sig)`** -- House reveals the outcome (wins/loses)
- **`refund_bet()`** -- Player gets their money back (if house doesn't respond)

### `state/mod.rs` -- The Data Model

Defines the **`Bet` account** -- data stored on-chain for each bet:

| Field    | Type     | Description                                                        |
| -------- | -------- | ------------------------------------------------------------------ |
| `player` | `Pubkey` | Who placed the bet                                                 |
| `seed`   | `u128`   | Unique identifier for this bet                                     |
| `slot`   | `u64`    | When the bet was placed (for timeout/refund logic)                 |
| `amount` | `u64`    | How much SOL was bet (in lamports; 1 SOL = 1,000,000,000 lamports) |
| `roll`   | `u8`     | The threshold the player chose (2-96)                              |
| `bump`   | `u8`     | Technical field for Solana PDA derivation                          |

It also implements a `to_slice()` method that serializes all fields into a byte vector, used for Ed25519 signature verification.

### `errors.rs` -- Error Codes

Custom errors for validation:

- `MinimumBet` -- Bet below 0.01 SOL
- `MaximumBet` -- Bet exceeds maximum
- `MinimumRoll` -- Roll below 2
- `MaximumRoll` -- Roll above 96
- `TimeoutNotReached` -- Refund attempted before timeout
- `Ed25519*` -- Various Ed25519 signature verification errors
- `BumpError`, `Overflow` -- Technical errors

### `instructions/initialize.rs` -- Fund the House Vault

- The **house** (operator) calls this to deposit SOL into a vault.
- The vault is a **PDA** (Program Derived Address) -- a special account controlled by the program, not any person.
- Its address is derived from the seeds `["vault", house_public_key]`.
- Uses a CPI (cross-program invocation) to the System Program to transfer SOL.

### `instructions/place_bet.rs` -- Player Places a Bet

- Creates a new **Bet account** (a PDA derived from `["bet", vault, seed]`).
- Transfers the bet amount from the player to the vault.
- Records all bet details (player, seed, slot, amount, roll, bump) on-chain.
- Has two internal methods:
  - `create_bet()` -- populates the Bet account fields
  - `deposit()` -- transfers SOL from player to vault

### `instructions/resolve_bet.rs` -- Determine the Winner

This is the most complex instruction. It has three stages:

**Stage 1: Ed25519 Signature Verification**

- The house signs the bet data with its private key.
- The program verifies this signature on-chain using Solana's Ed25519 precompile.
- This ensures the randomness is provably fair -- the house can't cheat because the signature is deterministic for a given message.

**Stage 2: Random Number Generation**

- Take the Ed25519 signature bytes
- Hash them with SHA-256
- Split the 32-byte hash into two 16-byte halves
- Convert each half to a `u128` number, add them together
- Take modulo 100 + 1 = a number from 1 to 100

**Stage 3: Payout Calculation**

- If `player_roll > computed_roll`, the player wins
- Payout formula: `(bet_amount * (10000 - 150)) / (roll - 1) / 100`
- The `150` represents a 1.5% house edge (in basis points out of 10,000)
- Payout is transferred from the vault to the player via a PDA-signed CPI

### `instructions/refund_bet.rs` -- Refund a Bet

- If the house never resolves a bet (goes offline), the player can get their money back.
- Originally had a **timeout** (must wait ~1000 slots / ~7 minutes), but it's currently commented out for testing.
- Transfers the bet amount from vault back to the player.
- Closes the Bet account and returns its rent to the player.

---

## Key Solana/Anchor Concepts

### PDA (Program Derived Address)

A special account address derived from seeds + the program ID. No one has a private key for it -- only the program can sign for it. Used for the vault and bet accounts. This is how the program "owns" SOL without any human having the private key.

### CPI (Cross-Program Invocation)

The dice game program calls the System Program to transfer SOL. Think of it like one smart contract calling another. When the vault (a PDA) needs to send SOL, the program signs on its behalf using `seeds` and the `bump`.

### Ed25519 Precompile

Solana has a built-in program (`Ed25519Program`) that verifies Ed25519 signatures. The dice game uses this for provably fair randomness -- the house signs the bet data, and the signature is verified on-chain before being hashed to produce the random roll.

### Account Model

On Solana, everything is an account. The program itself, the vault, each bet -- they're all accounts with data and SOL balances. Accounts must be explicitly created (allocated) and have their space defined upfront.

### Lamports

The smallest unit of SOL. 1 SOL = 1,000,000,000 lamports. All on-chain amounts are in lamports.

---

## The Test Suite

Located in `tests/anchor-dice-game-q4-25.ts`. Uses Anchor's TypeScript SDK with Mocha/Chai.

### Setup

- Creates `house` and `player` keypairs.
- Derives PDAs: `vault` (seeded with `["vault", house]`) and `bet` (seeded with `["bet", vault, seed_bytes]`).
- Airdrops 1000 SOL each to house and player in the `before` hook.

### Test 1: "initializes the house"

- Calls `initialize` with 1 SOL.
- Verifies the vault balance equals 1 SOL.

### Test 2: "places a bet"

- Calls `placeBet` with seed=1234, roll=10, amount=1 SOL.
- Verifies vault balance increased and player balance decreased.

### Test 3: "refund the bet"

- Calls `refundBet`.
- Verifies the player's balance increased (refund received).

### Missing Test

There is **no test for `resolve_bet`** because it requires constructing a valid Ed25519 signature instruction as a preceding instruction in the same transaction, which is complex to set up in tests.

---

## Deployment Infrastructure

### Surfpool

A local development tool that simulates the Solana network. Commands:

- `surfpool start` -- Start a local simnet
- `surfpool start --watch` -- Start with hot-reload on code changes
- `surfpool ls` -- List deployed programs
- `surfpool run deployment` -- Run a deployment runbook

### txtx Runbooks (`runbooks/deployment/`)

Infrastructure-as-code files for deploying the program:

- **`main.tx`** -- Defines the deployment action. Reads the compiled `.so` binary from Anchor's build output and deploys it on-chain.
- **`signers.localnet.tx`** -- Uses a local keypair file (`~/.config/solana/id.json`) for signing.
- **`signers.devnet.tx`** -- Uses a browser wallet for signing.
- **`signers.mainnet.tx`** -- Uses a browser wallet (recommends hardware wallet for production).

### Environment Config (`txtx.yml`)

Defines two environments:

- `localnet` at `http://127.0.0.1:8899`
- `devnet` at `https://api.devnet.solana.com`

---

## Config Files Explained

| File                   | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `Anchor.toml`          | Anchor project config: program ID, network, wallet path, test commands      |
| `Cargo.toml` (root)    | Rust workspace config with optimized release profile (LTO, overflow checks) |
| `Cargo.toml` (program) | Program crate config: dependencies, features, build targets                 |
| `package.json`         | Node.js dependencies: Anchor SDK, Solana web3.js, test tools                |
| `tsconfig.json`        | TypeScript config: ES6 target, CommonJS modules, Mocha/Chai types           |
| `rust-toolchain.toml`  | Pins Rust to version 1.89.0 with rustfmt and clippy                         |
| `txtx.yml`             | Surfpool/txtx config for different deployment environments                  |

---

## Known Issues

1. **Program ID mismatch:** `lib.rs` declares program ID `FUuRrG3UmsPFKVxmEoXQ3HL7yixBfjbZSYE4FYqcPGhN` while `Anchor.toml` declares `DZDRzKdTu4SweFFjDutMgPqu55Qt9TLbhWG1cMAikYVp`. These must be synchronized.

2. **Syntax errors in `resolve_bet.rs`:** There's a stray backtick character on line 78 and a missing semicolon on line 95 that will prevent compilation.

3. **Disabled timeout:** The refund timeout check in `refund_bet.rs` is commented out, meaning a player could immediately refund after betting (defeating the game's purpose).

4. **Missing test:** `resolve_bet` is untested -- the Ed25519 signature verification makes it complex to test.
