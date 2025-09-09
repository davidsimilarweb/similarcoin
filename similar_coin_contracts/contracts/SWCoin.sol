// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import the ERC20 contract from OpenZeppelin.
// OpenZeppelin provides industry-standard, secure, and audited smart contracts.
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SWCoin
 * @dev This is a simple ERC20 token contract.
 * It inherits from the OpenZeppelin ERC20 standard and adds a fixed initial supply.
 */
contract SWCoin is ERC20, Ownable {
    // Defines the token's initial supply. The number is multiplied by 10^18
    // because most ERC20 tokens have 18 decimal places by default.
    // For example, 10,000 * 10^18 represents 10,000 tokens.
    uint256 public constant INITIAL_SUPPLY = 1000000 * 10 ** 18;

    /**
     * @dev The constructor of the contract.
     * It is run only once when the contract is deployed.
     * @param name The name of the token (e.g., "My Token").
     * @param symbol The symbol of the token (e.g., "MAT").
     */
    constructor(string memory name, string memory symbol) ERC20(name, symbol) Ownable(msg.sender) {
        // Mint the initial supply of tokens to the address that deploys the contract.
        // `_mint` is an internal function from the ERC20 library.
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
