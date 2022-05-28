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
      let whale = accounts[1];
      let minnow = accounts[2];
      let whaleAmount = 200.0 * 10**8;
      let minnowAmount   = 0.01   * 10**8;

      await newCoin.approve(bathHouseInstance.address, 1000 * 10**8, { from: admin });
      await newCoin.transfer(whale, whaleAmount, { from: admin });
      await newCoin.transfer(minnow, minnowAmount, { from: admin });

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

      let withDec = (bn) => {
          return bn.toNumber() / 10**8;
      }


      await newCoin.approve(bathToken.address, 1000 * 10**8, { from: admin });
      await newCoin.approve(bathToken.address, whaleAmount, { from: whale });
      await newCoin.approve(bathToken.address, minnowAmount, { from: minnow });

      let feeBps = 50; // 0.50%
      await bathHouseInstance.setBathTokenFeeBPS(bathToken.address, feeBps);
      let initShares = whaleAmount + minnowAmount;
      let correctFeesAtEnd = web3.utils.toBN(initShares * feeBps / 10000);

      await bathToken.deposit(whaleAmount, whale, { from: whale });
      await bathToken.deposit(minnowAmount,   minnow,   { from: minnow }  );

      console.log("feeTo            ", await bathToken.feeTo());
      console.log("bathToken address", bathToken.address);


      /* 
       * Uncommenting the following line will prevent the minnow getting such a disproportionate
       * reward
       */
      //      bathHouseInstance.setBathTokenFeeTo(bathToken.address, accounts[3]);

      console.log("whale shares",  withDec(await bathToken.balanceOf(whale)));
      console.log("minnow shares  ",  withDec(await bathToken.balanceOf(minnow)));
      console.log("total shares",  withDec(await bathToken.totalSupply()));
      console.log("underlyingBalance",  withDec(await bathToken.underlyingBalance()));


      await bathToken.withdraw(whaleAmount, { from: whale} );
      console.log("whale tokens after withdraw", withDec(await newCoin.balanceOf(whale)));
      console.log("bathToken totalSupply      ", withDec(await bathToken.totalSupply()));
      console.log("underlyingBalance",  withDec(await bathToken.underlyingBalance()));
      await bathToken.withdraw(minnowAmount, { from: minnow} );

      let minnowsTokensAfter = await newCoin.balanceOf(minnow);
      console.log("minnow tokens after withdraw", withDec(minnowsTokensAfter));
      console.log("minnow return multiplier    ", minnowsTokensAfter.toNumber() / minnowAmount);

      console.log("actual bathToken totalSupply ", withDec(await bathToken.totalSupply()));
      console.log("expected bathToken totalSupply", withDec(correctFeesAtEnd));
    });
  });
});