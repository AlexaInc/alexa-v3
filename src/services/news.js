const axios = require("axios").default;

const fetchNews = async () => {
  const options = {
    method: "GET",
    url: "https://flashnews-736769978816.europe-west1.run.app/api/news",
  };

  try {
    const response = await axios.request(options);

    const data = response.data.data;

    const arranged = [];
    for (let i = 0; i < data.length; i++) {
      const news = {
        title: data[i].title_en,
        description: data[i].content_en,
        url: `https://news.furo.lk/news/detail/${data[i]._id}?language=en`,
      };

      arranged.push(news);
    }
    return arranged;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
module.exports = fetchNews;
