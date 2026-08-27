const fs = require('fs');
const path = require('path');
const config = require('../config/env');

class AnalyticsService {
  constructor(analyticsPath = config.analyticsPath) {
    this.analyticsPath = analyticsPath;
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.analyticsPath)) {
        const initial = {
          totalPageViews: 1,
          resumeDownloads: 0,
          contactSubmissions: 0,
          lastUpdated: new Date().toISOString(),
          dailyStats: {}
        };
        fs.writeFileSync(this.analyticsPath, JSON.stringify(initial, null, 2), 'utf8');
      }
    } catch (e) {}
  }


  getData() {
    try {
      if (!fs.existsSync(this.analyticsPath)) return { totalPageViews: 1, resumeDownloads: 0 };
      return JSON.parse(fs.readFileSync(this.analyticsPath, 'utf8'));
    } catch (e) {
      return { totalPageViews: 1, resumeDownloads: 0 };
    }
  }


  track(eventType = 'pageview') {
    const data = this.getData();
    const today = new Date().toISOString().slice(0, 10);
    
    if (!data.dailyStats) data.dailyStats = {};
    if (!data.dailyStats[today]) {
      data.dailyStats[today] = { pageviews: 0, resumeDownloads: 0, submissions: 0 };
    }

    if (eventType === 'pageview') {
      data.totalPageViews = (data.totalPageViews || 0) + 1;
      data.dailyStats[today].pageviews += 1;
    } else if (eventType === 'resume_download') {
      data.resumeDownloads = (data.resumeDownloads || 0) + 1;
      data.dailyStats[today].resumeDownloads += 1;
    } else if (eventType === 'submission') {
      data.contactSubmissions = (data.contactSubmissions || 0) + 1;
      data.dailyStats[today].submissions += 1;
    }

    data.lastUpdated = new Date().toISOString();

    try {
      fs.writeFileSync(this.analyticsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}

    return data;
  }
}


module.exports = new AnalyticsService();
