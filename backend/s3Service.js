const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class S3DataService {
  constructor() {
    this.s3Client = null;
    this.bucketName = process.env.S3_BUCKET_NAME;
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.enabled = process.env.ENABLE_S3_STORAGE === 'true';
    
    if (this.enabled) {
      this.initializeS3();
    }
  }

  initializeS3() {
    try {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      console.log('S3 client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize S3 client:', error);
      this.enabled = false;
    }
  }

  // Anonymize sensitive data
  anonymizeData(data) {
    const anonymized = { ...data };
    
    // Hash the wallet address for privacy
    if (anonymized.walletAddress) {
      anonymized.walletAddressHash = crypto
        .createHash('sha256')
        .update(anonymized.walletAddress)
        .digest('hex').substring(0, 16);
      delete anonymized.walletAddress; // Remove original address
    }

    // Anonymize navigation data
    if (anonymized.navigationData && Array.isArray(anonymized.navigationData)) {
      anonymized.navigationData = anonymized.navigationData.map(item => ({
        domain: item.domain,
        timeSpent: item.timeSpent,
        timestamp: item.timestamp,
        // Remove specific URLs and titles for privacy
        category: this.categorizeUrl(item.url)
      }));
    }

    // Anonymize ChatGPT prompts (keep for analytics but remove sensitive content)
    if (anonymized.chatgptPrompts && Array.isArray(anonymized.chatgptPrompts)) {
      anonymized.chatgptPrompts = anonymized.chatgptPrompts.map(item => ({
        type: item.type,
        domain: item.domain,
        timestamp: item.timestamp,
        promptLength: item.promptLength,
        // Remove actual prompt content for privacy in anonymized version
        category: this.categorizePrompt(item.prompt)
      }));
    }

    return anonymized;
  }

  // Categorize URLs for analytics while preserving privacy
  categorizeUrl(url) {
    const domain = new URL(url).hostname.toLowerCase();
    
    if (domain.includes('shop') || domain.includes('store') || domain.includes('buy')) return 'shopping';
    if (domain.includes('social') || domain.includes('facebook') || domain.includes('twitter')) return 'social';
    if (domain.includes('news') || domain.includes('blog')) return 'news';
    if (domain.includes('video') || domain.includes('youtube') || domain.includes('netflix')) return 'entertainment';
    if (domain.includes('work') || domain.includes('office') || domain.includes('docs')) return 'productivity';
    
    return 'general';
  }

  // Categorize ChatGPT prompts for analytics while preserving privacy
  categorizePrompt(prompt) {
    if (!prompt) return 'unknown';
    
    const lower = prompt.toLowerCase();
    
    if (lower.includes('code') || lower.includes('program') || lower.includes('debug')) return 'programming';
    if (lower.includes('write') || lower.includes('essay') || lower.includes('article')) return 'writing';
    if (lower.includes('explain') || lower.includes('what is') || lower.includes('how does')) return 'education';
    if (lower.includes('help') || lower.includes('solve') || lower.includes('fix')) return 'problem_solving';
    if (lower.includes('create') || lower.includes('design') || lower.includes('make')) return 'creative';
    if (lower.includes('analyze') || lower.includes('compare') || lower.includes('evaluate')) return 'analysis';
    
    return 'general';
  }

  // Generate S3 key structure for raw data (uses actual wallet address)
  generateRawS3Key(walletAddress, type = 'raw-data') {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const timestamp = Date.now();
    const submissionId = uuidv4();

    // Use actual wallet address for raw data (easier to find/manage)
    return `${type}/${year}/${month}/${day}/${walletAddress}/${timestamp}-${submissionId}.json`;
  }

  // Generate S3 key structure for anonymized data (uses wallet hash for privacy)
  generateAnonymizedS3Key(walletAddress, type = 'anonymized-data') {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const timestamp = Date.now();
    const submissionId = uuidv4();

    const walletHash = crypto
      .createHash('sha256')
      .update(walletAddress)
      .digest('hex').substring(0, 16);

    return `${type}/${year}/${month}/${day}/wallet-${walletHash}/${timestamp}-${submissionId}.json`;
  }

  // Store raw data submission
  async storeSubmission(submissionData) {
    if (!this.enabled || !this.s3Client) {
      console.log('S3 storage disabled, skipping...');
      return null;
    }

    try {
      // Store raw data (with full wallet address for internal use)
      const rawKey = this.generateRawS3Key(submissionData.walletAddress);
      const rawData = {
        ...submissionData,
        storedAt: new Date().toISOString(),
        submissionId: uuidv4()
      };

      await this.uploadToS3(rawKey, rawData);

      // Store anonymized version for analytics
      const anonymizedKey = this.generateAnonymizedS3Key(submissionData.walletAddress);
      const anonymizedData = this.anonymizeData(submissionData);
      anonymizedData.storedAt = rawData.storedAt;
      anonymizedData.submissionId = rawData.submissionId;

      await this.uploadToS3(anonymizedKey, anonymizedData);

      console.log('Data stored successfully:', { rawKey, anonymizedKey });
      
      return {
        submissionId: rawData.submissionId,
        rawKey,
        anonymizedKey,
        storedAt: rawData.storedAt
      };

    } catch (error) {
      console.error('Failed to store data in S3:', error);
      throw error;
    }
  }

  // Upload data to S3
  async uploadToS3(key, data) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'stored-by': 'datatrade-extension',
        'data-version': '1.0'
      }
    });

    return await this.s3Client.send(command);
  }

  // Get submission data
  async getSubmission(key) {
    if (!this.enabled || !this.s3Client) {
      return null;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.s3Client.send(command);
      const data = await response.Body.transformToString();
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to retrieve data from S3:', error);
      return null;
    }
  }

  // List submissions for analytics
  async listSubmissions(prefix = 'anonymized-data/', maxKeys = 100) {
    if (!this.enabled || !this.s3Client) {
      return [];
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      });

      const response = await this.s3Client.send(command);
      return response.Contents || [];
    } catch (error) {
      console.error('Failed to list submissions:', error);
      return [];
    }
  }

  // Generate analytics report
  async generateAnalytics(days = 7) {
    if (!this.enabled) {
      return { error: 'S3 storage disabled' };
    }

    try {
      const submissions = await this.listSubmissions('anonymized-data/', 1000);
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Filter recent submissions
      const recentSubmissions = submissions.filter(item => 
        new Date(item.LastModified) > cutoffDate
      );

      // Basic analytics
      const analytics = {
        totalSubmissions: recentSubmissions.length,
        dateRange: `${days} days`,
        averagePerDay: Math.round(recentSubmissions.length / days),
        dataGenerated: `${(recentSubmissions.reduce((sum, item) => sum + item.Size, 0) / 1024 / 1024).toFixed(2)} MB`,
        lastUpdated: new Date().toISOString()
      };

      return analytics;
    } catch (error) {
      console.error('Failed to generate analytics:', error);
      return { error: error.message };
    }
  }
}

module.exports = S3DataService;