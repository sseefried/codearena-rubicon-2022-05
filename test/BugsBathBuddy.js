const BathHouse = artifacts.require("BathHouse");
const BathPair = artifacts.require("BathPair");
const BathBuddy = artifacts.require("BathBuddy");
const BathToken = artifacts.require("BathToken");
const RubiconMarket = artifacts.require("RubiconMarket");
const DAI = artifacts.require("TokenWithFaucet");
const WETH = artifacts.require("WETH9");
const TokenWithFaucet = artifacts.require("TokenWithFaucet");
const helper = require("./testHelpers/timeHelper.js");


//Helper function
function logIndented(...args) {
  console.log("       ", ...args);
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

contract("Bath Token", (accounts) => {
  let rubiconMarketInstance;
  let bathHouseInstance;
  let bathPairInstance;
  let bathAssetInstance;
  let bathQuoteInstance;
  let DAIInstance;
  let WETHInstance;
  let bathTokenImplementation;

  describe("Deployment & Startup", async function () {
    it("Is deployed successfully", async () => {
      rubiconMarketInstance = await RubiconMarket.deployed();
      bathHouseInstance = await BathHouse.deployed();
      bathPairInstance = await BathPair.deployed();
      DAIInstance = await DAI.deployed();
      WETHInstance = await WETH.deployed();
      bathTokenImplementation = await BathToken.new();
    });
    it("Is successfully initialized", async () => {
      await bathHouseInstance.initialize(
        rubiconMarketInstance.address,
        80,
        10,
        bathTokenImplementation.address,
        accounts[9] // Proxy admin
        // 20
      );
      assert.equal(await bathHouseInstance.initialized(), true);
    });
    it("Is wired to the BathPair contract", async () => {
      await bathHouseInstance.initBathPair(bathPairInstance.address, 500, -5); // 90% reserve ratio and 3 days cancel delay
      let pair = await bathHouseInstance.approvedPairContract();
      logIndented("getting this pair", pair);
      bathPairInstance = await BathPair.at(pair);
    });
    it("Minnow bob gets most of the fees paid by whale Alice", async () => {
      // Deploy an arbitrary ERC-20 with a custom name and decimals
      const newCoinSymbol = "TEST";
      let newCoin = await TokenWithFaucet.new(
        accounts[0],
        "Test Coin",
        newCoinSymbol,
        8
      );

      let admin = accounts[0];
      let alice = accounts[1];
      let bob = accounts[2];
      let aliceAmount = 199.99 * 10**8;
      let bobAmount   = 0.01   * 10**8;

      await newCoin.approve(bathHouseInstance.address, 1000 * 10**8, { from: admin });
      await newCoin.transfer(alice, aliceAmount, { from: admin });
      await newCoin.transfer(bob, bobAmount, { from: admin });

      // logIndented("Getting this new coin", newCoin.address);
      let expectZero = await bathHouseInstance.tokenToBathToken(
        newCoin.address
      );
      assert.equal(expectZero, ZERO_ADDRESS);

      // Deploy a bathToken for that ERC-20
      await bathHouseInstance.createBathToken(newCoin.address, accounts[0]);
      let newBathToken = await bathHouseInstance.tokenToBathToken(
        newCoin.address
      );

      // Now simulate that bathToken contract has 

      let bathToken = await BathToken.at(newBathToken);
      let bathTokenName = await bathToken.name();
      let bathTokenSymbol = await bathToken.symbol();
      let block = await web3.eth.getBlock('latest');


      await newCoin.approve(bathToken.address, 1000 * 10**8, { from: admin });
      await newCoin.approve(bathToken.address, aliceAmount, { from: alice });
      await newCoin.approve(bathToken.address, bobAmount, { from: bob });

      // beneficiary = bathToken.address
      let bathBuddy = await BathBuddy.new(bathToken.address, block.timestamp, 365 * 86400);


      await bathHouseInstance.setBonusToken(bathToken.address, newCoin.address);
      await bathHouseInstance.setBathTokenBathBuddy(bathToken.address, bathBuddy.address);

      let feeBps = 5;
      await bathHouseInstance.setBathTokenFeeBPS(bathToken.address, feeBps);

      let initBathBuddyTokens = aliceAmount + bobAmount;
      let correctFeesAtEnd = initBathBuddyTokens * feeBps / 10000;

      await newCoin.transfer(bathBuddy.address, initBathBuddyTokens, { from: admin});
      await bathToken.deposit(aliceAmount, alice, { from: alice });
      await bathToken.deposit(bobAmount, bob, { from: bob });

      console.log("alice shares", (await bathToken.balanceOf(alice)).toString());
      console.log("bob shares", (await bathToken.balanceOf(alice)).toString());
      console.log("total shares", (await bathToken.totalSupply()).toString());
      console.log("bath buddy tokens", (await newCoin.balanceOf(bathBuddy.address)).toString());

      helper.advanceTime(365*86400); // advance time by one year
      console.log("alice before tokens", (await newCoin.balanceOf(alice)).toString());
      console.log("bob before tokens", (await newCoin.balanceOf(bob)).toString());
      await bathToken.withdraw(aliceAmount, { from: alice} );
      console.log("alice after tokens", (await newCoin.balanceOf(alice)).toString());
      console.log("vested (which incorrectly included fees from Alice's withdrawal!)", (await bathBuddy.vestedAmount(newCoin.address, (await web3.eth.getBlock('latest')).timestamp)).toString());
      console.log("bath buddy tokens left before bob withdraw", (await newCoin.balanceOf(bathBuddy.address)).toString());
      await bathToken.withdraw(bobAmount, { from: bob} );

      let bobsTokensAfter = await newCoin.balanceOf(bob);
      console.log("bob after tokens", bobsTokensAfter.toString());

      console.log("bob return ", (bobsTokensAfter.toNumber()  - bobAmount) /  bobAmount);

      // Error is that fees get included into the `vestedAmount`

      console.log("actual bath buddy tokens", (await newCoin.balanceOf(bathBuddy.address)).toString());
      console.log("correct bath buddy tokens", correctFeesAtEnd);

    });
  });
});

/*

   We want to get R > V

   However, R = V  * f (where f < 1)

   So this is impossible! 

   a + b = 1
   vested = T + T * a * f  = T (1 + a*f)
   b*a*T*f

   1/2 * 1/2 * 200 * 0.05%




*/