const app = getApp()

// 默认问题配置（可通过参数覆盖）
const DEFAULT_QUESTION = {
  question_id: '2026-02-06-ai-fear',
  question: 'AI时代，你更担心哪个？',
  option_a: 'AI直接干掉你',
  option_a_desc: '有一天发现自己的工作被算法自动完成了，公司根本不需要这个岗位了',
  option_b: '隔壁工位干掉你',
  option_b_desc: '有一天发现同事用AI干活又快又好，老板觉得一个人能顶三个，你成了多余的那个'
}

Page({
  data: {
    loading: true,
    voting: false,
    hasVoted: false,
    showResult: false,
    selectedOption: null,
    
    questionId: '',
    question: '',
    optionA: { title: '', desc: '' },
    optionB: { title: '', desc: '' },
    
    percentA: 0,
    percentB: 0,
    total: 0
  },

  onLoad(options) {
    const questionId = options.id || options.question_id || DEFAULT_QUESTION.question_id
    this.setData({ questionId })
    this.loadQuestion(questionId)
  },

  // 解析选项文本
  parseOption(text) {
    if (!text) return { title: '', desc: '' }
    const parts = text.split(' — ')
    return {
      title: parts[0] || text,
      desc: parts[1] || ''
    }
  },

  // 加载问题
  async loadQuestion(questionId) {
    try {
      // 先尝试从云函数获取
      const res = await wx.cloud.callFunction({
        name: 'vote',
        data: {
          action: 'result',
          question_id: questionId
        }
      })

      if (res.result && res.result.success && res.result.data.question) {
        const data = res.result.data
        this.setData({
          question: data.question,
          optionA: this.parseOption(data.option_a),
          optionB: this.parseOption(data.option_b),
          loading: false
        })
      } else {
        // 使用默认问题
        this.useDefaultQuestion()
      }

      // 检查是否已投票
      await this.checkVoted(questionId)

    } catch (err) {
      console.error('加载问题失败:', err)
      this.useDefaultQuestion()
    }
  },

  useDefaultQuestion() {
    this.setData({
      question: DEFAULT_QUESTION.question,
      optionA: {
        title: DEFAULT_QUESTION.option_a,
        desc: DEFAULT_QUESTION.option_a_desc
      },
      optionB: {
        title: DEFAULT_QUESTION.option_b,
        desc: DEFAULT_QUESTION.option_b_desc
      },
      loading: false
    })
  },

  // 检查是否已投票
  async checkVoted(questionId) {
    try {
      // 从本地存储检查
      const votedKey = `voted_${questionId}`
      const voted = wx.getStorageSync(votedKey)
      
      if (voted) {
        this.setData({
          hasVoted: true,
          selectedOption: voted
        })
        // 加载结果
        await this.loadResult(questionId)
      }
    } catch (err) {
      console.error('检查投票状态失败:', err)
    }
  },

  // 加载结果
  async loadResult(questionId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'vote',
        data: {
          action: 'result',
          question_id: questionId
        }
      })

      if (res.result && res.result.success) {
        const data = res.result.data
        this.setData({
          percentA: data.percent_a || 0,
          percentB: data.percent_b || 0,
          total: data.total || 0,
          showResult: true
        })
      }
    } catch (err) {
      console.error('加载结果失败:', err)
    }
  },

  // 投票
  async vote(e) {
    if (this.data.voting || this.data.hasVoted) return

    const choice = e.currentTarget.dataset.choice
    
    this.setData({ voting: true, selectedOption: choice })

    try {
      // 获取用户唯一标识
      let openid = app.globalData.openid
      if (!openid) {
        // 通过云函数获取 openid
        const loginRes = await wx.cloud.callFunction({ name: 'login' })
        openid = loginRes.result?.openid
        app.globalData.openid = openid
      }

      const res = await wx.cloud.callFunction({
        name: 'vote',
        data: {
          action: 'submit',
          question_id: this.data.questionId,
          vote: choice,
          voter_id: openid || `wx_${Date.now()}`
        }
      })

      if (res.result && res.result.success) {
        const data = res.result.data
        
        // 保存投票状态
        wx.setStorageSync(`voted_${this.data.questionId}`, choice)
        
        this.setData({
          hasVoted: true,
          percentA: data.percent_a || 0,
          percentB: data.percent_b || 0,
          total: data.total || 0,
          showResult: true,
          voting: false
        })

        if (!data.already_voted) {
          wx.showToast({
            title: '投票成功',
            icon: 'success',
            duration: 1500
          })
        }
      } else {
        throw new Error(res.result?.message || '投票失败')
      }

    } catch (err) {
      console.error('投票失败:', err)
      wx.showToast({
        title: '投票失败，请重试',
        icon: 'none'
      })
      this.setData({
        voting: false,
        selectedOption: null
      })
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: this.data.question || '今日之问',
      path: `/pages/vote/vote?id=${this.data.questionId}`
    }
  },

  onShareTimeline() {
    return {
      title: this.data.question || '今日之问',
      query: `id=${this.data.questionId}`
    }
  }
})
