const BathHouse = artifacts.require("BathHouse");
const BathPair = artifacts.require("BathPair");
const BathBuddy = artifacts.require("BathBuddy");
const BathToken = artifacts.require("BathToken");
const RubiconMarket = artifacts.require("RubiconMarket");
const DAI = artifacts.require("TokenWithFaucet");
const WETH = artifacts.require("WETH9");
const TokenWithFaucet = artifacts.require("TokenWithFaucet");
const { assert } = require("chai");
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
    it("BathHouse can set fee BPS to 100%", async () => {
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
      let aliceAmount = 100 * 10**8;  // 100 tokens

      await newCoin.approve(bathHouseInstance.address, 1000 * 10**8, { from: admin });
      await newCoin.transfer(alice, aliceAmount, { from: admin });

      let expectZero = await bathHouseInstance.tokenToBathToken(
        newCoin.address
      );
      assert.equal(expectZero, ZERO_ADDRESS);

      // Deploy a bathToken for that ERC-20
      await bathHouseInstance.createBathToken(newCoin.address, accounts[0]);
      let newBathToken = await bathHouseInstance.tokenToBathToken(
        newCoin.address
      );

      let bathToken = await BathToken.at(newBathToken);

      let withDec = (bn) => {
          return bn.toNumber() / 10**8;
      }

      await newCoin.approve(bathToken.address, 1000 * 10**8, { from: admin });
      await newCoin.approve(bathToken.address, aliceAmount, { from: alice });

      console.log("Alice tokens before deposit", withDec(await newCoin.balanceOf(alice)));
      await bathToken.deposit(aliceAmount, alice, { from: alice });

      // Bath house sets fee BPS to 10000 (100%)
      await bathHouseInstance.setBathTokenFeeBPS(bathToken.address, 10000);

      await bathToken.withdraw(aliceAmount, { from: alice} );
      console.log("Alice tokens after withdraw", withDec(await newCoin.balanceOf(alice)));
      assert.equal(await newCoin.balanceOf(alice), 0);
    });
  });
});