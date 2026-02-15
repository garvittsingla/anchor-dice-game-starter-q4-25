
use anchor_instruction_sysvar::Ed25519InstructionSignatures;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{Transfer, transfer};
use crate::state::Bet;
// use anchor-instruction-sysvar::{SysvarInstruction};
use crate::errors::{DiceError};
use solana_program::{
    ed25519_program, hash::hash, sysvar::instructions::load_instruction_at_checked,
};


pub const HOUSE_EDGE : u16 = 150;
#[derive(Accounts)]
pub struct ResolveBet<'info>{
    pub house : Signer<'info>,
    #[account(
        mut
    )]
    ///CHECK: This is safe
    pub player: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"vault", house.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        mut,
        close = player,
        seeds = [b"bet", vault.key().as_ref(), bet.seed.to_le_bytes().as_ref()],
        bump = bet.bump
    )]
    pub bet: Account<'info, Bet>,
    pub system_program: Program<'info, System>,
    #[account(
        address = solana_program::sysvar::instructions::ID
    )]
    ///CHECK: This is safe
    pub instruction_sysvar: UncheckedAccount<'info>

}
impl <'info> ResolveBet<'info> {
    pub fn verify_ed25519_signature(&mut self,sig: &[u8])-> Result<()> {
         let ix = load_instruction_at_checked(0, &self.instruction_sysvar.to_account_info());

         let result = ix.unwrap();
         
        require_eq!(result.program_id, ed25519_program::ID, DiceError::Ed25519Program);
        require_eq!(result.accounts.len() , 0, DiceError::Ed25519DataLength);


        let signatures = Ed25519InstructionSignatures::unpack(&result.data).unwrap().0;

        require_eq!(signatures.len(), 1, DiceError::Ed25519DataLength);

        let signature = &signatures[0];
        require_eq!(signature.is_verifiable, true, DiceError::Ed25519Header);

        require_keys_eq!(signature.public_key.ok_or(DiceError::Ed25519Header)?, self.house.key(), DiceError::Ed25519Pubkey);
        
        require!(&signature.signature.ok_or(DiceError::Ed25519Signature)?.eq(sig), DiceError::Ed25519Signature);
         Ok(())
        
        

    }

    pub fn resolve_bet(&mut self, sig: &[u8], bumps: &ResolveBetBumps) -> Result<()>{
        let hash = hash(sig).to_bytes();
        let mut hash_16 : [u8; 16] = [0; 16];
        hash_16.copy_from_slice(&hash[..16]);
        let lower = u128::from_le_bytes(hash_16);
        hash_16.copy_from_slice(&hash[16..32]);
        let upper = u128::from_le_bytes(hash_16);
        let roll = lower.wrapping_add(upper).wrapping_rem(100) as u8 + 1;

`       if self.bet.roll > roll{
            let payout = (self.bet.amount as u128)
                .checked_mul(10000 - HOUSE_EDGE as u128).ok_or(DiceError::Overflow)?
                .checked_div(self.bet.roll as u128 - 1).ok_or(DiceError::Overflow)?
                .checked_div(100).ok_or(DiceError::Overflow)?;


            let signer_seeds : &[&[&[u8]]] = &[&[
                b"vault",
                &self.house.key().to_bytes().as_ref(),
                &[bumps.vault],
            ]];

            let accounts = Transfer{
                from: self.vault.to_account_info(),
                to: self.player.to_account_info(),
            }

            let ctx = CpiContext::new_with_signer(self.system_program.to_account_info(), accounts, signer_seeds);
            transfer(ctx, payout as u64)?;
        }

        Ok(())
    }
}