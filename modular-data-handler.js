// modular-data-handler.js
// Universal data handler for JsPsych - works locally and online

class JsPsychDataHandler {
  constructor(jsPsychInstance, options = {}) {
    // Validate the injected dependency
    if (!jsPsychInstance) {
      throw new Error('jsPsych instance is required. Pass the jsPsych object as the first parameter.');
    }
    
    if (!jsPsychInstance.randomization || !jsPsychInstance.data) {
      throw new Error('Invalid jsPsych instance. Make sure jsPsych is properly initialized.');
    }
    
    // Store the jsPsych instance
    this.jsPsych = jsPsychInstance;
    
    this.serverUrl = options.serverUrl || 'https://pathplanning-server.onrender.com';
    this.experimentName = options.experimentName || 'experiment';
    // FIX: Use the passed instance, not global jsPsych
    this.participantId = options.participantId || this.jsPsych.randomization.randomID();
    this.isLocal = this.detectLocalEnvironment();
    this.fallbackToLocal = options.fallbackToLocal !== false; // Default true
    
    console.log(`Data handler initialized with jsPsych v${this.jsPsych.version()}`);
    console.log(`Mode: ${this.isLocal ? 'LOCAL' : 'SERVER'}`);
    console.log(`Participant ID: ${this.participantId}`);
  }

  // Factory method for easier creation
  static create(options = {}) {
    // Check if jsPsych is available globally
    if (typeof jsPsych === 'undefined') {
      throw new Error('jsPsych not found. Initialize jsPsych first or pass it explicitly to the constructor.');
    }
    
    return new JsPsychDataHandler(jsPsych, options);
  }
  
  // Detect if running locally vs on server
  detectLocalEnvironment() {
    return window.location.protocol === 'file:' || 
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname === '';
  }
  
  // Main data submission method - automatically chooses local vs server
  async submitData(data, options = {}) {
    const submissionData = {
      participant_id: this.participantId,
      timestamp: new Date().toISOString(),
      experiment_name: this.experimentName,
      data: data,
      environment: this.isLocal ? 'local' : 'server',
      user_agent: navigator.userAgent,
      ...options.metadata
    };
    
    if (this.isLocal) {
      return this.saveLocalData(submissionData, options);
    } else {
      try {
        return await this.sendToServer(submissionData, options);
      } catch (error) {
        console.warn('Server upload failed:', error);
        
        if (this.fallbackToLocal) {
          console.log('Falling back to local download...');
          return this.saveLocalData(submissionData, options);
        } else {
          throw error;
        }
      }
    }
  }
  
  // Send data to server
  async sendToServer(data, options = {}) {
    const endpoint = options.endpoint || '/api/trial';
    const url = `${this.serverUrl}${endpoint}`;
    
    console.log(`Sending data to server: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trial_data: data.data,
        participant_id: data.participant_id,
        timestamp: data.timestamp,
        metadata: data
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Server response:', result);
    return { method: 'server', success: true, result };
  }
  
  // Save data locally as downloadable file
  saveLocalData(data, options = {}) {
    const fileType = options.fileType || 'json';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = options.filename || 
      `${this.experimentName}_${this.participantId}_${timestamp}.${fileType}`;
    
    let content, mimeType;
    
    if (fileType === 'csv') {
      content = this.convertToCSV(Array.isArray(data.data) ? data.data : [data.data]);
      mimeType = 'text/csv';
    } else {
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
    }
    
    console.log(`About to download file: ${filename}`); // Debug log
    this.downloadFile(content, filename, mimeType);
    console.log(`Data saved locally as: ${filename}`);
    
    return { method: 'local', success: true, filename };
  }
  
  // Helper method to download file
  downloadFile(content, filename, mimeType) {
    console.log(`downloadFile called: ${filename}, type: ${mimeType}`); // Debug log
    
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      console.log('About to click download link...'); // Debug log
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      console.log('Download triggered successfully'); // Debug log
    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  }
  
  // Convert JSON data to CSV format
  convertToCSV(dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return '';
    }
    
    // Flatten nested objects for CSV
    const flattenedData = dataArray.map(item => this.flattenObject(item));
    
    // Get all unique headers
    const headers = [...new Set(flattenedData.flatMap(Object.keys))].sort();
    
    // Create CSV content
    const csvRows = [
      headers.join(','), // Header row
      ...flattenedData.map(row => 
        headers.map(header => {
          let value = row[header] || '';
          
          // Handle values that need escaping
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            value = `"${value.replace(/"/g, '""')}"`;
          }
          
          return value;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  }
  
  // Flatten nested objects for CSV export
  flattenObject(obj, prefix = '') {
    const flattened = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}_${key}` : key;
        
        if (value === null || value === undefined) {
          flattened[newKey] = '';
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          // Recursively flatten nested objects
          Object.assign(flattened, this.flattenObject(value, newKey));
        } else if (Array.isArray(value)) {
          // Convert arrays to JSON strings
          flattened[newKey] = JSON.stringify(value);
        } else {
          flattened[newKey] = value;
        }
      }
    }
    
    return flattened;
  }
  
  // Submit complete experiment data (typically called at end)
  async submitCompleteData(options = {}) {
    
    const allData = this.jsPsych.data.get().values();
    
    try {
      const result = await this.submitData(allData, {
        endpoint: '/api/data',
        fileType: options.format || 'json',
        filename: options.filename,
        metadata: {
          submission_type: 'complete_experiment',
          total_trials: allData.length,
          completion_time: this.jsPsych.getTotalTime(), // FIX: Use this.jsPsych
          ...options.metadata
        }
      });
      
      return result;
    } catch (error) {
      console.error('Failed to submit complete data:', error);
      throw error;
    }
  }
  
  // Get current environment info
  getEnvironmentInfo() {
    return {
      isLocal: this.isLocal,
      serverUrl: this.serverUrl,
      participantId: this.participantId,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      fallbackEnabled: this.fallbackToLocal
    };
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { JsPsychDataHandler };
}