const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');
const TuanAnh = require('./TuanAnh');

class ZooAPIClient {
    constructor() {
        this.baseUrl = 'https://api.zoo.team';
        this.headers = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "Content-Type": "application/json",
            "Origin": "https://game.zoo.team",
            "Referer": "https://game.zoo.team/",
            "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="131", "Chromium";v="131"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Is-Beta-Server": "null"
        };
        this.proxyList = [];
        this.loadProxies();
        this.config = {};
        this.loadConfig();
    }
    async promptUserForConfirmation(message) {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
    
            rl.question(message, (answer) => {
                rl.close();
                resolve(answer.trim().toLowerCase());
            });
        });
    }

    loadConfig() {
        try {
            const configFile = path.join(__dirname, 'config.json');
            if (fs.existsSync(configFile)) {
                const rawConfig = fs.readFileSync(configFile, 'utf8');
                const parsedConfig = JSON.parse(rawConfig);
                this.config = {
                    enableBoost: parsedConfig.enableBoost ?? false,
                    boostType: parsedConfig.boostType || '5_boost_for_24_hours',
                    enableDonation: parsedConfig.enableDonation ?? false,
                    donationAmountRange: {
                        min: parsedConfig.donationAmountRange?.min || 500,
                        max: parsedConfig.donationAmountRange?.max || 1000
                    },
                    maxUpgradeLevel: parsedConfig.maxUpgradeLevel || 10,
                    enableQuizzes: parsedConfig.enableQuizzes ?? true,
                    countdownMinutes: parsedConfig.countdownMinutes || 10,
                    enableBuyOrUpgradeAnimals: parsedConfig.enableBuyOrUpgradeAnimals ?? true
                };                
            } else {
                TuanAnh.log('File config.json không tồn tại. Sử dụng cấu hình mặc định.', 'warning');
                this.config = {
                    enableBoost: false,
                    boostType: '5_boost_for_24_hours',
                    enableDonation: false,
                    donationAmountRange: {
                        min: 500,
                        max: 1000
                    },
                    maxUpgradeLevel: 10,
                    enableQuizzes: true,
                    countdownMinutes: 10
                };
            }
        } catch (error) {
            TuanAnh.log('Lỗi khi tải cấu hình: ' + error.message, 'error');
            this.config = {
                enableBoost: false,
                boostType: '5_boost_for_24_hours',
                enableDonation: false,
                donationAmountRange: {
                    min: 500,
                    max: 1000
                },
                maxUpgradeLevel: 10,
                enableQuizzes: true,
                countdownMinutes: 10
            };
        }
    }
     
    loadProxies() {
        try {
            const proxyFile = path.join(__dirname, 'proxy.txt');
            if (fs.existsSync(proxyFile)) {
                this.proxyList = fs.readFileSync(proxyFile, 'utf8')
                    .replace(/\r/g, '')
                    .split('\n')
                    .filter(Boolean)
                    .map(line => {
                        const [ip, port, user, pass] = line.split(':');
                        if (user && pass) {
                            return `http://${user}:${pass}@${ip}:${port}`;
                        }
                        return `http://${ip}:${port}`;
                    });
            }
        } catch (error) {
            TuanAnh.log('Error loading proxies: ' + error.message, 'error');
        }
    }
    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                timeout: 10000
            });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Lỗi khi kiểm tra proxy: ${error.message}`);
        }
    }
    getAxiosConfig(index) {
        if (this.proxyList.length > 0 && index >= 0 && index < this.proxyList.length) {
            return {
                httpsAgent: new HttpsProxyAgent(this.proxyList[index]),
                timeout: 30000
            };
        }
        return { timeout: 30000 };
    }
    
    async createApiHash(timestamp, data) {
        const combinedData = `${timestamp}_${data}`;
        const encodedData = encodeURIComponent(combinedData);
        return crypto.createHash("md5").update(encodedData).digest("hex");
    }
    async login(initData, accountIndex) {
        if (!initData) {
            return { success: false, error: 'initData is required' };
        }
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Could not extract hash from initData');
            }
            const currentTime = Math.floor(Date.now() / 1000);
            const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
            const startParam = initData.split('start_param=')[1]?.split('&')[0] || '';
            const chatInstance = initData.split('chat_instance=')[1]?.split('&')[0] || '';
            const payload = {
                data: {
                    initData: initData,
                    startParam: startParam,
                    photoUrl: userData.photo_url || "",
                    platform: "android",
                    chatId: "",
                    chatType: "channel",
                    chatInstance: chatInstance
                }
            };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
            const response = await axios.post(
                "https://api.zoo.team/telegram/auth",
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
            if (response.status === 200 && response.data.success) {
                return { success: true, data: response.data.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async finishOnboarding(initData, accountIndex) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Could not extract hash from initData');
            }
            const currentTime = Math.floor(Date.now() / 1000);
            const payload = { data: 1 };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
            const response = await axios.post(
                "https://api.zoo.team/hero/onboarding/finish",
                payload,
                { 
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
            if (response.status === 200 && response.data.success) {
                return { success: true, data: response.data.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    async getUserData(initData, accountIndex) {
        if (!initData) {
            return { success: false, error: 'initData is required' };
        }
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Could not extract hash from initData');
            }
            const currentTime = Math.floor(Date.now() / 1000);
            const dataPayload = JSON.stringify({ data: {} });
            const apiHash = await this.createApiHash(currentTime, dataPayload);
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
            const response = await axios.post(
                "https://api.zoo.team/user/data/all",
                { data: {} },
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );

            if (response.status === 200 && response.data.success) {
                this.cachedData = response.data.data;
                return { success: true, data: response.data.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    async getUserDataAfter(initData, accountIndex) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Không thể trích xuất hash từ initData.');
            }
    
            const currentTime = Math.floor(Date.now() / 1000);
            const payload = { data: {} };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
    
            const response = await axios.post(
                "https://api.zoo.team/user/data/after",
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
    
            if (response.status === 200 && response.data.success) {
                return { success: true, data: response.data.data };
            } else {
                throw new Error(response.data.message || 'API trả về thất bại.');
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async claimDailyReward(initData, rewardIndex, accountIndex) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Could not extract hash from initData');
            }
            const currentTime = Math.floor(Date.now() / 1000);
            const payload = { data: rewardIndex };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
            const response = await axios.post(
                "https://api.zoo.team/quests/daily/claim",
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
            if (response.status === 200 && response.data.success) {
                return { success: true, data: response.data.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    async handleAutoFeed(initData, accountIndex) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Could not extract hash from initData');
            }
            const userDataResult = await this.getUserData(initData, accountIndex);
            if (!userDataResult.success) {
                throw new Error(`Failed to get user data: ${userDataResult.error}`);
            }
            const { hero, feed } = userDataResult.data;
            if (feed.isNeedFeed) {
                if (!hero.onboarding.includes("20")) {
                    const currentTime = Math.floor(Date.now() / 1000);
                    const payload = { data: 20 };
                    const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
                    const headers = {
                        ...this.headers,
                        "api-hash": apiHash,
                        "Api-Key": hash,
                        "Api-Time": currentTime
                    };
                    const onboardingResponse = await axios.post(
                        "https://api.zoo.team/hero/onboarding/finish",
                        payload,
                        {
                            headers,
                            ...this.getAxiosConfig(accountIndex)
                        }
                    );

                    if (!onboardingResponse.data.success) {
                        throw new Error('Failed to complete onboarding step 20');
                    }
                }
                const currentTime = Math.floor(Date.now() / 1000);
                const feedPayload = { data: "instant" };
                const apiHash = await this.createApiHash(currentTime, JSON.stringify(feedPayload));
                const headers = {
                    ...this.headers,
                    "api-hash": apiHash,
                    "Api-Key": hash,
                    "Api-Time": currentTime
                };
                const feedResponse = await axios.post(
                    "https://api.zoo.team/autofeed/buy",
                    feedPayload,
                    {
                        headers,
                        ...this.getAxiosConfig(accountIndex)
                    }
                );
                if (feedResponse.data.success) {
                    TuanAnh.log('Cho động vật ăn thành công', 'success');
                    return { success: true, data: feedResponse.data };
                }
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    async buyOrUpgradeAnimals(initData, accountIndex) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Could not extract hash from initData');
            }
    
            const userDataResult = await this.getUserData(initData, accountIndex);
            if (!userDataResult.success) {
                throw new Error(`Failed to get user data: ${userDataResult.error}`);
            }
            const { animals, hero, dbData } = userDataResult.data;
            const existingKeys = new Set(animals.map(animal => animal.key));
            const usedPositions = new Set(animals.map(animal => animal.position));
            for (const dbAnimal of dbData.dbAnimals) {
                if (!existingKeys.has(dbAnimal.key)) {
                    const level1Price = dbAnimal.levels[0].price;
                    if (hero.coins >= level1Price) {
                        let position = 1;
                        while (usedPositions.has(position)) {
                            position++;
                        }
                        const currentTime = Math.floor(Date.now() / 1000);
                        const payload = { data: { position, animalKey: dbAnimal.key } };
                        const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
                        const headers = {
                            ...this.headers,
                            "api-hash": apiHash,
                            "Api-Key": hash,
                            "Api-Time": currentTime
                        };
                        const response = await axios.post(
                            "https://api.zoo.team/animal/buy",
                            payload,
                            {
                                headers,
                                ...this.getAxiosConfig(accountIndex)
                            }
                        );
                        if (response.status === 200 && response.data.success) {
                            TuanAnh.log(`Mua thành công ${dbAnimal.title}`, 'success');
                            usedPositions.add(position);
                            existingKeys.add(dbAnimal.key);
                        }
                    }
                }
            }
            const maxUpgradeLevel = this.config.maxUpgradeLevel || 10;
            for (const animal of animals) {
                const dbAnimal = dbData.dbAnimals.find(dba => dba.key === animal.key);
                if (dbAnimal) {
                    const nextLevel = animal.level + 1;
                    if (nextLevel > maxUpgradeLevel) {
                        continue;
                    }
    
                    const nextLevelData = dbAnimal.levels.find(l => l.level === nextLevel);
                    if (nextLevelData && hero.coins >= nextLevelData.price) {
                        const currentTime = Math.floor(Date.now() / 1000);
                        const payload = { data: { position: animal.position, animalKey: animal.key } };
                        const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
                        const headers = {
                            ...this.headers,
                            "api-hash": apiHash,
                            "Api-Key": hash,
                            "Api-Time": currentTime
                        };
    
                        try {
                            const response = await axios.post(
                                "https://api.zoo.team/animal/buy",
                                payload,
                                {
                                    headers,
                                    ...this.getAxiosConfig(accountIndex)
                                }
                            );
    
                            if (response.status === 200 && response.data.success) {
                                TuanAnh.log(`Nâng cấp ${dbAnimal.title} thành công lên level ${nextLevel}`, 'success');
                            }
                        } catch (error) {
                            if (error.response?.status === 500) {
                                TuanAnh.log(`Không thể nâng cấp ${dbAnimal.title}: ${error.message}`, 'error');
                            }
                        }
                    }
                }
            }
    
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    


    
    async joinAlliance(initData, allianceId, accountIndex) {
        try {
            const userDataResult = await this.getUserData(initData, accountIndex);
            if (!userDataResult.success) {
                throw new Error(`Failed to get user data: ${userDataResult.error}`);
            }
            const { hero, alliance } = userDataResult.data;
            if (alliance && alliance.name) {
            } else {
            }
            if (alliance && alliance.id) {
                return { success: false, error: `Người chơi đã thuộc liên minh: ${alliance.name}` };
            }
            const enterFee = 1000;
            if (hero.coins <= enterFee) {
                return { success: false, error: 'Không đủ feed để tham gia liên minh' };
            }

            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Could not extract hash from initData');
            }

            const currentTime = Math.floor(Date.now() / 1000);
            const payload = { data: allianceId };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));

            const url = `${this.baseUrl.replace(/\/+$/, '')}/alliance/join`;

            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };

            const response = await axios.post(url, payload, {
                headers,
                ...this.getAxiosConfig(accountIndex)
            });

            if (response.status === 200 && response.data.success) {
                TuanAnh.log('Tham gia liên minh thành công', 'success');
                return { success: true, data: response.data.data };
            } else {
                throw new Error(response.data.message || 'Tham gia liên minh thất bại');
            }
        } catch (error) {
            TuanAnh.log('Lỗi khi tham gia liên minh: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    async claimQuestReward(questKey, accountIndex, initData) {
        try {
            if (!questKey) {
                throw new Error('Quest key không hợp lệ.');
            }
    
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Không tìm thấy hash từ initData.');
            }
    
            const currentTime = Math.floor(Date.now() / 1000);
            const payload = { data: [questKey, null] };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
    
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
    
            const response = await axios.post(
                `${this.baseUrl}/quests/claim`,
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
    
            if (response.status === 200 && response.data.success) {
                return { success: true, data: response.data.data };
            } else if (response.data.error === 'already rewarded') {
                return { success: false, error: 'already rewarded' };
            } else {
                throw new Error(response.data.error || 'API trả về thất bại.');
            }
        } catch (error) {
            TuanAnh.log(`Lỗi khi nhận thưởng: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    
    async checkQuestCompletion(questKey, checkData, accountIndex, initData) {
        try {
            if (!initData || typeof initData !== 'string') {
                throw new Error('initData không hợp lệ hoặc không được cung cấp.');
            }
    
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Không thể trích xuất hash từ initData.');
            }
    
            const currentTime = Math.floor(Date.now() / 1000);
            const payload = { data: [questKey, checkData] };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
    
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
    
            const response = await axios.post(
                `${this.baseUrl}/quests/check`,
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
    
            if (response.status === 200 && response.data.success) {
                return { success: true, result: response.data.data.result };
            } else {
                throw new Error(response.data.message || 'API trả về thất bại.');
            }
        } catch (error) {
            TuanAnh.log(`Lỗi trong checkQuestCompletion: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    async buyBoost(initData, accountIndex) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Không thể trích xuất hash từ initData.');
            }
    
            const currentTime = Math.floor(Date.now() / 1000);
            const boostType = this.config.boostType || "5_boost_for_24_hours";
            const userData = await this.getUserData(initData, accountIndex);
            if (!userData.success) {
                throw new Error('Không thể lấy thông tin người dùng để kiểm tra fees.');
            }
    
            const coins = userData.data?.hero?.coins || 0;
            const boostCostMap = {
                "5_boost_for_24_hours": 50,
                "10_boost_for_24_hours": 100,
                "15_boost_for_24_hours": 250,
                "20_boost_for_24_hours": 1000,
                "25_boost_for_24_hours": 5000,
                "30_boost_for_24_hours": 17000,
                "35_boost_for_24_hours": 25000,
                "40_boost_for_24_hours": 40000,
                "45_boost_for_24_hours": 60000,
                "50_boost_for_24_hours": 90000,
                "60_boost_for_24_hours": 225000,
                "70_boost_for_24_hours": 350000,
                "80_boost_for_24_hours": 525000,
                "90_boost_for_24_hours": 800000,
                "100_boost_for_24_hours": 1200000
            };
    
            const requiredCoins = boostCostMap[boostType] || Infinity;
            if (coins < requiredCoins) {
                TuanAnh.log(`Không đủ feed để mua boost: ${boostType}. Feed hiện tại: ${coins}, yêu cầu: ${requiredCoins}`, 'warning');
                return { success: false, error: `Không đủ feed để mua ${boostType}.` };
            }
    
            const payload = { data: boostType };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
    
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
            const response = await axios.post(
                `${this.baseUrl}/boost/buy`,
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
    
            if (response.status === 200 && response.data.success) {
                TuanAnh.log(`Mua boost thành công: ${boostType}`, 'success');
                return { success: true, data: response.data.data };
            } else {
                throw new Error(response.data.message || 'Mua boost thất bại.');
            }
        } catch (error) {
            TuanAnh.log(`Lỗi khi mua boost: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    async leaveAlliance(initData, accountIndex) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Không thể trích xuất hash từ initData.');
            }
    
            const currentTime = Math.floor(Date.now() / 1000);
            const payload = { data: {} };
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
    
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
    
            const response = await axios.post(
                `${this.baseUrl}/alliance/leave`,
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
    
            if (response.status === 200 && response.data.success) {

                return { success: true, data: response.data.data };
            } else {
                throw new Error(response.data.message || 'API trả về thất bại.');
            }
        } catch (error) {
            TuanAnh.log(`Lỗi khi rời khỏi liên minh: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    
    async donateToAlliance(initData, accountIndex) {
        let response;
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Không thể trích xuất hash từ initData.');
            }
    
            const userDataResult = await this.getUserData(initData, accountIndex);
            if (!userDataResult.success) {
                throw new Error(`Không thể lấy dữ liệu người dùng: ${userDataResult.error}`);
            }
    
            const { hero } = userDataResult.data;
    
            const donationMax = this.config.donationAmountRange.max || 1000;
            const donationMin = this.config.donationAmountRange.min || 500;
    
            if (hero.coins < donationMin) {
                TuanAnh.log(
                    `Số feed hiện tại ${hero.coins} < ${donationMin}, Bạn nghèo vlol.`,
                    ''
                );
                return { success: false, error: 'Số feed không đủ để đóng góp.' };
            }
    
            if (hero.coins < donationMax) {
                TuanAnh.log(
                    `Số feed hiện tại ${hero.coins} < ${donationMax}, Bạn nghèo vlol.`,
                    ''
                );
                return { success: false, error: 'Số feed nhỏ hơn mức đóng góp tối đa.' };
            }
            const donationAmount = Math.floor(Math.random() * (donationMax - donationMin + 1)) + donationMin;
    
            const payload = { data: donationAmount };
            const currentTime = Math.floor(Date.now() / 1000);
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
            response = await axios.post(
                `${this.baseUrl}/alliance/donate`,
                payload,
                {
                    headers,
                    ...this.getAxiosConfig(accountIndex)
                }
            );
    
            if (response.status === 200 && response.data.success) {
                return { success: true, data: response.data.data };
            } else {
                const errorMessage = response.data?.message || 'API trả về thất bại.';
                TuanAnh.log(`Phản hồi từ API: ${JSON.stringify(response.data)}`, 'error');
                throw new Error(errorMessage);
            }
        } catch (error) {
            const errorMessage = response?.data?.message || error.message || 'Unknown error';
            return { success: false, error: errorMessage };
        }
    }

    calculateQuizResult(quiz) {
        if (!quiz || !quiz.questions || quiz.questions.length === 0) {
            TuanAnh.log(`Quiz không có câu hỏi hoặc dữ liệu không hợp lệ: ${JSON.stringify(quiz)}`, 'error');
            return null;
        }
    
        const scores = {};
        for (const question of quiz.questions) {
            for (const option of question.options) {
                for (const [animal, score] of Object.entries(option.animals || {})) {
                    scores[animal] = (scores[animal] || 0) + score;
                }
            }
        }
        const resultAnimal = Object.keys(scores).reduce((a, b) => (scores[a] > scores[b] ? a : b), null);
        if (!resultAnimal) {
            TuanAnh.log(`Không thể xác định kết quả cho quiz: ${quiz.key}`, 'error');
        }
    
        return resultAnimal;
    }
    async apiRequest(url, payload, proxyIndex, initData) {
        try {
            const hash = initData.split('hash=')[1]?.split('&')[0];
            if (!hash) {
                throw new Error('Không thể trích xuất hash từ initData.');
            }
    
            const currentTime = Math.floor(Date.now() / 1000);
            const apiHash = await this.createApiHash(currentTime, JSON.stringify(payload));
    
            const headers = {
                ...this.headers,
                "api-hash": apiHash,
                "Api-Key": hash,
                "Api-Time": currentTime
            };
    
            const axiosConfig = this.getAxiosConfig(proxyIndex);
    
            const response = await axios.post(url, payload, {
                headers,
                ...axiosConfig
            });
    
            if (response.status === 200 && response.data.success) {
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                return {
                    success: false,
                    error: response.data.message || 'API trả về thất bại.'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Exception during API request'
            };
        }
    }
    
    async claimQuizReward(quizKey, accountIndex, useProxy, initData) {
        try {
            if (!quizKey) {
                throw new Error("Quiz key không hợp lệ.");
            }
    
            const payload = { data: { key: quizKey } };
            const proxyIndex = useProxy ? accountIndex : -1;
            const apiUrl = "https://api.zoo.team/quiz/claim";
    
            const response = await this.apiRequest(apiUrl, payload, proxyIndex, initData);
            if (response.success) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: response.error || "API trả về thất bại." };
            }
        } catch (error) {
            return { success: false, error: error.message || "Exception during API call" };
        }
    }
    
    
    async submitQuizResult(quizKey, resultAnimal, accountIndex, useProxy, initData) {
        if (!quizKey || !resultAnimal) {
            throw new Error("Dữ liệu quiz hoặc kết quả không hợp lệ.");
        }
    
        const payload = {
            data: {
                key: quizKey,
                result: resultAnimal
            }
        };
    
        const proxyIndex = useProxy ? accountIndex : -1;
        const apiUrl = "https://api.zoo.team/quiz/result/set";
    
        try {
            const response = await this.apiRequest(apiUrl, payload, proxyIndex, initData);
            if (response.success) {
                return {
                    success: true,
                    data: response.data
                };
            } else {
                return {
                    success: false,
                    error: response.error || "Unknown error"
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message || "Exception during API call"
            };
        }
    }
    
    async processQuizzes(dbQuizzes, accountIndex, useProxy, initData) {
        const userDataAfter = await this.getUserDataAfter(initData, accountIndex);
        if (!userDataAfter.success) {
            TuanAnh.log(`Không thể lấy dữ liệu từ getUserDataAfter: ${userDataAfter.error}`, 'error');
            return;
        }
    
        const quizzesData = userDataAfter.data?.quizzes || [];
    
        for (const quiz of dbQuizzes) {
            if (!quiz || !quiz.key) {
                TuanAnh.log(`Quiz không hợp lệ: ${JSON.stringify(quiz)}`, 'warning');
                continue;
            }
    
            const quizTitle = quiz.title && quiz.title.trim() !== "" ? quiz.title : `Key: ${quiz.key}`;
            TuanAnh.log(`Đang xử lý quiz:`.white+` ${quizTitle}`.cyan, 'info');

            const existingQuiz = quizzesData.find(q => q.key === quiz.key);
            if (existingQuiz?.isRewarded) {
                TuanAnh.log(`${quizTitle} đã hoàn thành trước đó.`, 'info');
                continue;
            }
    
            const resultAnimal = this.calculateQuizResult(quiz);
            if (!resultAnimal) {
                TuanAnh.log(`Không thể tính kết quả cho quiz ${quizTitle}.`, 'error');
                continue;
            }
    
            try {
                const submitResult = await this.submitQuizResult(quiz.key, resultAnimal, accountIndex, useProxy, initData);
    
                if (submitResult.success) {
                    TuanAnh.log(`Gửi kết quả quiz ${quizTitle} thành công.`, 'success');

                    const claimResult = await this.claimQuizReward(quiz.key, accountIndex, useProxy, initData);
                    if (claimResult.success) {
                        TuanAnh.log(`Nhận thưởng quiz ${quizTitle} thành công.`, 'success');
                    } else {
                        TuanAnh.log(`Lỗi khi nhận thưởng quiz ${quizTitle}: ${claimResult.error || "Unknown error"}`, 'error');
                    }
                } else {
                    TuanAnh.log(`Lỗi khi gửi kết quả quiz ${quizTitle}: ${submitResult.error || "Unknown error"}`, 'error');
                }
            } catch (error) {
                TuanAnh.log(`Exception khi xử lý quiz ${quizTitle}: ${error.message}`, 'error');
            }
        }
    }
    
    async checkQuizCompletion(quizKey, accountIndex, initData) {
        try {
            if (!quizKey) {
                throw new Error("Quiz key không hợp lệ.");
            }
    
            const payload = { data: { key: quizKey } };
            const proxyIndex = useProxy ? accountIndex : -1;
            const apiUrl = "https://api.zoo.team/quiz/status";
    
            const response = await this.apiRequest(apiUrl, payload, proxyIndex, initData);
            if (response.success) {
                return { success: true, isCompleted: response.data.isCompleted || false };
            } else {
                return { success: false, error: response.error || "Unknown error" };
            }
        } catch (error) {
            return { success: false, error: error.message || "Exception during API call" };
        }
    }
    
    async processAccount(initData, accountIndex) {
        let useProxy = true;
        try {
            const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
            const username = userData.username || 'Unknown';
    
            let proxyIP = 'No proxy';
            if (this.proxyList[accountIndex] && useProxy) {
                try {
                    proxyIP = await this.checkProxyIP(this.proxyList[accountIndex]);
                } catch (proxyError) {
                    TuanAnh.log(`Proxy check failed: ${proxyError.message}`.red, '');
                    TuanAnh.log(`Chuyển tài khoản`.yellow+` ${username}`.cyan+` sang chế độ No proxy.`.yellow, '');
                    useProxy = false;
                }
            }
    
            TuanAnh.logSeparator();
            console.log(`| Account ${accountIndex + 1} |`.cyan + ` ${username.green} - ${proxyIP}`);
            TuanAnh.log(`Đang đăng nhập...`, 'info');
    
            const loginResult = await this.login(initData, useProxy ? accountIndex : -1);
            if (!loginResult.success) {
                throw new Error('Đăng nhập thất bại.');
            }
            TuanAnh.log('Đăng nhập thành công!', 'success');
    
            const userDataResult = await this.getUserData(initData, useProxy ? accountIndex : -1);
            if (!userDataResult.success) {
                throw new Error('Không thể lấy dữ liệu người dùng.');
            }
    
            const { hero, feed, dbData, alliance } = userDataResult.data || {};
            if (Array.isArray(hero.onboarding) && hero.onboarding.length === 0) {
                TuanAnh.log('Đang hoàn thành onboarding...', 'info');
                const onboardingResult = await this.finishOnboarding(initData, useProxy ? accountIndex : -1);
                if (onboardingResult.success) {
                    TuanAnh.log('Hoàn thành onboarding thành công!', 'success');
                } else {
                    TuanAnh.log('Hoàn thành onboarding thất bại.', 'error');
                }
            }
            const dataAfterResult = await this.getUserDataAfter(initData, useProxy ? accountIndex : -1);
            if (dataAfterResult.success) {
                const { dailyRewards } = dataAfterResult.data || {};
                for (let day = 1; day <= 16; day++) {
                    if (dailyRewards[day] === 'canTake') {
                        TuanAnh.log(`Đang nhận phần thưởng ngày ${day}...`, 'info');
                        try {
                            const claimResult = await this.claimDailyReward(initData, day, useProxy ? accountIndex : -1);
                            if (claimResult.success) {
                                TuanAnh.log(`Nhận phần thưởng ngày ${day} thành công!`, 'success');
                            } else {
                                TuanAnh.log(`Lỗi khi nhận phần thưởng ngày ${day}: ${claimResult.error}`, 'error');
                            }
                        } catch (error) {
                            TuanAnh.log(`Exception khi nhận phần thưởng ngày ${day}: ${error.message}`, 'error');
                        }
                        break;
                    }
                }
            } else {
                TuanAnh.log('Không thể lấy thông tin phần thưởng hàng ngày.', 'warning');
            }
            const { dbQuizzes = [] } = dbData || {};
            if (dbQuizzes.length > 0) {
                TuanAnh.log(`Bắt đầu xử lý quizzes cho tài khoản ${accountIndex + 1}...`, 'info');
                await this.processQuizzes(dbQuizzes, accountIndex, useProxy, initData);
            } else {
                TuanAnh.log(`Không tìm thấy quiz nào cho tài khoản ${accountIndex + 1}.`, 'info');
            }
            let ignoredQuests = [];
            try {
                const filePath = path.join(__dirname, 'skiptask.txt');
                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    ignoredQuests = fileContent
                        .split('\n')
                        .map(line => line.trim())
                        .filter(Boolean);
                } else {
                    console.error('File skiptask.txt không tồn tại!');
                }
            } catch (error) {
                console.error('Lỗi khi đọc file skiptask.txt:', error.message);
            }
            
            const { dbQuests = [] } = dbData || {};
            const filteredQuests = dbQuests.filter(quest => !ignoredQuests.includes(quest.title));
            
            for (const quest of filteredQuests) {
                if (!quest || !quest.key) {
                    TuanAnh.log(`Nhiệm vụ không hợp lệ: ${JSON.stringify(quest)}`, 'warning');
                    continue;
                }
            
                const questTitle = quest.title && quest.title.trim() !== "" ? quest.title : `Key: ${quest.key}`;
            
                if (quest.checkType === "fakeCheck") {
                    const boxName = quest.key.includes("chest_m") 
                        ? "Gift Box 1" 
                        : quest.key.includes("chest_l") 
                        ? "Gift Box 2" 
                        : "Gift Box 3";
            
                    TuanAnh.log(`Đang tìm kiếm ${boxName}`, 'info');
            
                    if (quest.reward) {
                        TuanAnh.log(`Đã tìm thấy ${boxName} - `.green+`${quest.reward}`.white+` feed`.cyan, 'success');
                    }
            
                    try {
                        const claimResult = await this.claimQuestReward(quest.key, accountIndex, initData);
                        if (claimResult.success) {
                            TuanAnh.log(`Lụm ${boxName} thành công!`, 'success');
                            quest.isRewarded = true;
                        } else if (claimResult.error === "already rewarded") {
                            TuanAnh.log(`${boxName} đã được lụm trước đó.`, 'info');
                        } else {
                            TuanAnh.log(`Lỗi khi lụm ${boxName}: ${claimResult.error}`, 'error');
                        }
                    } catch (error) {
                        TuanAnh.log(`Exception khi lụm ${boxName}: ${error.message}`, 'error');
                    }
                } else if (quest.checkType === "checkCode") {
                    TuanAnh.log(`Đang kiểm tra nhiệm vụ:`.white + ` ${questTitle}`.cyan, 'info');
        
                    const checkResult = await this.checkQuestCompletion(quest.key, quest.checkData, accountIndex, initData);
            
                    if (!checkResult.success) {
                        TuanAnh.log(`Lỗi khi kiểm tra nhiệm vụ ${quest.key}: ${checkResult.error}`, 'error');
                        continue;
                    }
            
                    if (checkResult.result) {
                        TuanAnh.log(`Nhiệm vụ`.white + ` ${quest.title}`.cyan + ` sẵn sàng để nhận thưởng với từ khóa`.white+` ${quest.checkData}.`.red, 'success');
            
                        try {
                            const claimResult = await this.claimQuestReward(quest.key, accountIndex, initData);
                            if (claimResult.success) {
                                TuanAnh.log(`Nhận thưởng nhiệm vụ ${questTitle} thành công.`, 'success');
                                quest.isRewarded = true;
                            } else if (claimResult.error === "already rewarded") {
                                TuanAnh.log(`${quest.key} đã hoàn thành trước đó.`, 'info');
                            } else {
                                TuanAnh.log(`Lỗi khi nhận thưởng nhiệm vụ ${questTitle}: ${claimResult.error}`, 'error');
                            }
                        } catch (error) {
                            TuanAnh.log(`Exception khi nhận thưởng nhiệm vụ ${quest.title}: ${error.message}`, 'error');
                        }
                    } else {
                        TuanAnh.log(`Nhiệm vụ ${quest.title} chưa hoàn thành.`, 'warning');
                    }
                } else {
                    TuanAnh.log(`Loại nhiệm vụ không được hỗ trợ: ${quest.checkType}.`, 'warning');
                }
            }
            
            const allianceId = 1621;
            if (!alliance?.id) {
                const joinResult = await this.joinAlliance(initData, allianceId, accountIndex);
                if (joinResult.success) {
                    TuanAnh.log(`Tài khoản ${accountIndex + 1} đã tham gia liên minh thành công.`, 'success');
                } else {
                    TuanAnh.log(`Không thể tham gia liên minh: ${joinResult.error}`, 'warning');
                }
            }
            
            await this.handleAutoFeed(initData, useProxy ? accountIndex : -1);
            if (this.config.enableBuyOrUpgradeAnimals) {
                await this.buyOrUpgradeAnimals(initData, useProxy ? accountIndex : -1);
            } else {
            }
            const allianceInfo = alliance && alliance.name
            ? `Liên minh: ${alliance.name.magenta}- level: ${(alliance.level || 'N/A').toString().magenta} - members: ${(alliance.members || 'N/A').toString().magenta}`
            : "Chưa có liên minh";
        
        if (this.config.enableDonation) {
            const userDataResult = await this.getUserData(initData, useProxy ? accountIndex : -1);
            if (!userDataResult.success) {
                TuanAnh.log(`Không thể lấy dữ liệu người dùng: ${userDataResult.error}`, 'error');
            } else {
                const { hero } = userDataResult.data;
                const donationMin = this.config.donationAmountRange?.min || 500;
        
                if (hero.coins < donationMin) {
                    TuanAnh.log(`Số feed hiện tại ${hero.coins} < ${donationMin}, Bạn nghèo vlol.`, '');
                } else {
                    const donateResult = await this.donateToAlliance(initData, useProxy ? accountIndex : -1);
                    if (donateResult.success) {
                        TuanAnh.log('Đóng góp vào liên minh thành công!', 'success');
                    } else {
                        TuanAnh.log(`Lỗi khi đóng góp vào liên minh: ${donateResult.error}`, 'error');
                    }
                }
            }
        } else {

        }
        
        TuanAnh.log(`${username.cyan} - $ZOO: ${hero.tokens.toString().magenta} - Feed: ${hero.coins.toString().magenta} - ${allianceInfo}`, 'custom');
        
    
        } catch (error) {
            TuanAnh.log(`Error processing account ${accountIndex + 1}: ${error.message} - Lấy lại Query`, 'error');
        }

    }
    async main() {
        try {
            const dataFile = path.join(__dirname, 'queryZoo.txt');
            if (!fs.existsSync(dataFile)) {
                TuanAnh.log('queryZoo.txt file not found!', 'error');
                return;
            }
            const data = fs.readFileSync(dataFile, 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean);
    
            if (data.length === 0) {
                TuanAnh.log('No data found in queryZoo.txt', 'error');
                return;
            }
    
            const totalAccounts = data.length;
    
            process.stdout.write(`\x1b]0;Auto Multiple Zoo - Số tài khoản đang chạy: ${totalAccounts} - Tool by Tuấn Anh\x07`);
    
            const configFile = path.join(__dirname, 'config.json');
            const config = fs.existsSync(configFile)
                ? JSON.parse(fs.readFileSync(configFile, 'utf8'))
                : { maxThreads: 5 };
            const maxThreads = config.maxThreads || 5;
            const accountQueue = [...data];
            const activeTasks = new Set();
    
            const runAccount = async (accountIndex, initData) => {
                try {
                    await this.processAccount(initData, accountIndex);
                } catch (error) {
                    TuanAnh.log(`Error processing account ${accountIndex + 1}: ${error.message} - Lấy lại Query`, 'error');
                } finally {
                    activeTasks.delete(accountIndex);
                    if (accountQueue.length > 0) {
                        const nextInitData = accountQueue.shift();
                        const nextIndex = data.length - accountQueue.length - 1;
                        activeTasks.add(nextIndex);
                        runAccount(nextIndex, nextInitData);
                    }
                }
            };
    
            while (true) {
                while (activeTasks.size < maxThreads && accountQueue.length > 0) {
                    const initData = accountQueue.shift();
                    const accountIndex = data.length - accountQueue.length - 1;
                    activeTasks.add(accountIndex);
                    runAccount(accountIndex, initData);
                }

                while (activeTasks.size > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            
                if (this.config.countdownMinutes) {
                    TuanAnh.logSeparator();
                    TuanAnh.log(`Đã hoàn thành tất cả các tài khoản`, 'warning');
                    TuanAnh.log(`Cần chờ ${this.config.countdownMinutes} phút trước khi chạy lại...`, 'warning');
                    TuanAnh.logSeparator();
                    await TuanAnh.countdown(this.config.countdownMinutes);
            
                    accountQueue.push(...data);
                } else {
                    accountQueue.push(...data);
                }
            }
        } catch (error) {
            TuanAnh.log(`Main process error: ${error.message}`, 'error');
        }
    }     
}
const client = new ZooAPIClient();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});
