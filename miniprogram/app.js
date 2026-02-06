App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'mind-our-times-3g7c3va270081e5c',
        traceUser: true
      })
    }
  },
  
  globalData: {
    userInfo: null,
    openid: null
  }
})
