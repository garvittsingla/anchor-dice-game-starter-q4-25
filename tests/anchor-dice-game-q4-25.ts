import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { AnchorDiceGameQ425 } from "../target/types/anchor_dice_game_q4_25";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";


// import { BN } from "bn.js";

describe("anchor-dice-game-q4-25", async () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.anchorDiceGameQ425 as Program<AnchorDiceGameQ425>;
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;

  let house  = new Keypair();
  let player = new Keypair();
  let seed= new BN(1234);
  let vault = PublicKey.findProgramAddressSync([Buffer.from("vault"),house.publicKey.toBuffer()], program.programId)[0];
  let bet = PublicKey.findProgramAddressSync([Buffer.from("bet"),vault.toBuffer(),seed.toBuffer("le",16)], program.programId)[0];
  let signatue = Uint8Array;
  

  before(async ()=>{
    console.log("House: ",house.publicKey.toString());
    console.log("Player: ",player.publicKey.toString());
    console.log("before balance of house: ",(await connection.getBalance(house.publicKey))/anchor.web3.LAMPORTS_PER_SOL);
    console.log("before balance of player: ",(await connection.getBalance(player.publicKey))/anchor.web3.LAMPORTS_PER_SOL);
    await Promise.all([house,player].map(async(k)=>{
      return await connection.requestAirdrop(k.publicKey,1000 * anchor.web3.LAMPORTS_PER_SOL);
    }))
      console.log("after balance of house: ",(await connection.getBalance(house.publicKey))/anchor.web3.LAMPORTS_PER_SOL);
      console.log("after balance of player: ",(await connection.getBalance(player.publicKey))/anchor.web3.LAMPORTS_PER_SOL);
  })


  // initializing the house
  it("initializes the house", async () => {
    let vaultBalance = await connection.getBalance(vault);
    console.log("vault balance: ",vaultBalance/anchor.web3.LAMPORTS_PER_SOL);
    let signature = await program.methods.initialize(new BN(1*anchor.web3.LAMPORTS_PER_SOL))
    .accountsStrict({
      house: house.publicKey,
      vault: vault,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .signers([house])
    .rpc();
    console.log("initialize signature: ",signature);

    vaultBalance = await connection.getBalance(vault);
    console.log("vault balance: ",vaultBalance/anchor.web3.LAMPORTS_PER_SOL);
    expect(vaultBalance).to.equal(1*anchor.web3.LAMPORTS_PER_SOL);
  })


  it("places a bet",async()=>{
      let vaultBalance = await connection.getBalance(vault);
      let playerbalance = await connection.getBalance(player.publicKey);
      console.log("house balance before placing bet: ",vaultBalance/anchor.web3.LAMPORTS_PER_SOL);
      console.log("player balance before placing bet: ",playerbalance/anchor.web3.LAMPORTS_PER_SOL);
     let signature = await program.methods.placeBet(seed,10,new BN(1*anchor.web3.LAMPORTS_PER_SOL))
     .accountsStrict({
      player: player.publicKey,
      house: house.publicKey,
      vault: vault,
      bet: bet,
      systemProgram: anchor.web3.SystemProgram.programId
     })
      .signers([player])
      .rpc();
      console.log("place bet signature: ",signature);
      let aftervaultBalance = await connection.getBalance(vault);
      let afterplayerbalance = await connection.getBalance(player.publicKey);
      console.log("house balance after placing bet: ",aftervaultBalance/anchor.web3.LAMPORTS_PER_SOL);
      console.log("player balance after placing bet: ",afterplayerbalance/anchor.web3.LAMPORTS_PER_SOL);
      expect(aftervaultBalance).to.be.greaterThan(vaultBalance);
      expect(afterplayerbalance).to.be.lessThan(playerbalance);
      // expect(playerbalance).to.equal(999*anchor.web3.LAMPORTS_PER_SOL);

  })

  it("refund the bet",async()=>{
    
    let userbalancebefore = await connection.getBalance(player.publicKey);
    try {
      let signature =await program.methods.refundBet()
    .accountsStrict({
      player: player.publicKey,
      house: house.publicKey,
      vault: vault,
      bet: bet,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .signers([player])
    .rpc();
    console.log("refund bet signature: ",signature);
    
    } catch (error) {
      console.log("error: ",error);
    }

    let userbalanceafter = await connection.getBalance(player.publicKey);
    expect(userbalanceafter).to.be.greaterThan(userbalancebefore);

  })

});
