// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract DataTradeToken is ERC20, Ownable, Pausable {
    
    // Reward rates for different data types (controlled by backend)
    mapping(string => uint256) public rewardRates;
    
    // Anti-spam: track daily submissions per user
    mapping(address => mapping(uint256 => uint256)) public dailySubmissions; // user => day => count
    uint256 public maxDailySubmissions = 50; // Max submissions per user per day
    
    // Cooldown tracking (can be enabled/disabled)
    mapping(address => uint256) public lastSubmission;
    uint256 public cooldownPeriod = 1 hours;
    bool public cooldownEnabled = false; // Disabled for testing
    
    // Events
    event DataSubmissionRewarded(address indexed user, uint256 amount, string dataType);
    event RewardRateUpdated(string dataType, uint256 newRate);
    event MaxDailySubmissionsUpdated(uint256 newLimit);
    event CooldownSettingsUpdated(uint256 newPeriod, bool enabled);
    
    constructor() ERC20("DataTrade Token", "DTT") Ownable(msg.sender) {
        // Set flat rate: 0.1 tokens per page visited
        rewardRates["perpage"] = 1 * 10**(decimals() - 1); // 0.1 tokens per page
        
        // Mint initial supply for testing
        _mint(msg.sender, 1000000 * 10**decimals());
    }
    
    /**
     * @dev Reward user with tokens for data submission (legacy - for backward compatibility)
     * @param user Address of the user to reward
     * @param dataType Type of data submitted (determines reward amount)
     */
    function rewardUser(address user, string memory dataType) external onlyOwner whenNotPaused {
        require(user != address(0), "Invalid user address");
        require(rewardRates[dataType] > 0, "Invalid data type");
        
        // Check daily submission limit
        uint256 today = block.timestamp / 1 days;
        require(
            dailySubmissions[user][today] < maxDailySubmissions,
            "Daily submission limit exceeded"
        );
        
        // Check cooldown if enabled
        if (cooldownEnabled) {
            require(
                block.timestamp >= lastSubmission[user] + cooldownPeriod,
                "Cooldown period not met"
            );
        }
        
        uint256 rewardAmount = rewardRates[dataType];
        
        // Update tracking
        dailySubmissions[user][today]++;
        lastSubmission[user] = block.timestamp;
        
        // Mint tokens (no supply cap - system needs to keep rewarding)
        _mint(user, rewardAmount);
        
        emit DataSubmissionRewarded(user, rewardAmount, dataType);
    }

    /**
     * @dev Reward user with tokens based on pages visited (0.1 tokens per page)
     * @param user Address of the user to reward
     * @param pagesVisited Number of pages visited
     */
    function rewardUserForPages(address user, uint256 pagesVisited) external onlyOwner whenNotPaused {
        require(user != address(0), "Invalid user address");
        require(pagesVisited > 0, "Must have visited at least 1 page");
        
        // Check daily submission limit
        uint256 today = block.timestamp / 1 days;
        require(
            dailySubmissions[user][today] < maxDailySubmissions,
            "Daily submission limit exceeded"
        );
        
        // Check cooldown if enabled
        if (cooldownEnabled) {
            require(
                block.timestamp >= lastSubmission[user] + cooldownPeriod,
                "Cooldown period not met"
            );
        }
        
        // Calculate reward: 0.1 tokens per page visited
        uint256 rewardAmount = pagesVisited * rewardRates["perpage"];
        
        // Update tracking
        dailySubmissions[user][today]++;
        lastSubmission[user] = block.timestamp;
        
        // Mint tokens (no supply cap - system needs to keep rewarding)
        _mint(user, rewardAmount);
        
        emit DataSubmissionRewarded(user, rewardAmount, "pages");
    }
    
    /**
     * @dev Set reward rate for a specific data type
     * @param dataType The data type identifier
     * @param rate The reward amount in wei (18 decimals)
     */
    function setRewardRate(string memory dataType, uint256 rate) external onlyOwner {
        rewardRates[dataType] = rate;
        emit RewardRateUpdated(dataType, rate);
    }
    
    /**
     * @dev Update maximum daily submissions per user
     * @param newLimit New daily submission limit
     */
    function setMaxDailySubmissions(uint256 newLimit) external onlyOwner {
        require(newLimit > 0, "Limit must be greater than 0");
        maxDailySubmissions = newLimit;
        emit MaxDailySubmissionsUpdated(newLimit);
    }
    
    /**
     * @dev Configure cooldown settings
     * @param newPeriod New cooldown period in seconds
     * @param enabled Whether cooldown is enabled
     */
    function setCooldownSettings(uint256 newPeriod, bool enabled) external onlyOwner {
        cooldownPeriod = newPeriod;
        cooldownEnabled = enabled;
        emit CooldownSettingsUpdated(newPeriod, enabled);
    }
    
    /**
     * @dev Pause the contract (emergency use)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get user's remaining daily submissions
     * @param user User address to check
     * @return remaining Number of submissions left today
     */
    function getRemainingDailySubmissions(address user) external view returns (uint256 remaining) {
        uint256 today = block.timestamp / 1 days;
        uint256 used = dailySubmissions[user][today];
        return used >= maxDailySubmissions ? 0 : maxDailySubmissions - used;
    }
    
    /**
     * @dev Get user's token balance (convenience function)
     * @param user User address to check
     * @return balance Token balance
     */
    function getBalance(address user) external view returns (uint256 balance) {
        return balanceOf(user);
    }
    
    /**
     * @dev Get time until user can submit again (if cooldown enabled)
     * @param user User address to check
     * @return timeLeft Seconds until next submission allowed
     */
    function getCooldownTimeLeft(address user) external view returns (uint256 timeLeft) {
        if (!cooldownEnabled) return 0;
        
        uint256 timeSinceLastSubmission = block.timestamp - lastSubmission[user];
        if (timeSinceLastSubmission >= cooldownPeriod) return 0;
        
        return cooldownPeriod - timeSinceLastSubmission;
    }
}