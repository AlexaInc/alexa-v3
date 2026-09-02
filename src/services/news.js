const axios = require('axios');

async function sendRequest() {
  try {
    // Step 1: Send the POST request to get the event ID
    const postResponse = await axios.post('https://hansaka1-adaderananews.hf.space/gradio_api/call/predict', {
      data: []
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });


    const eventId = postResponse.data?.event_id; 

    if (!eventId) {
      console.error('Event ID not found in the POST response');
      return;
    }


    const getResponse = await axios.get(`https://hansaka1-adaderananews.hf.space/gradio_api/call/predict/${eventId}`);


    const rawResponse = getResponse.data;


    const cleanedResponse = rawResponse.replace(/^event:\s*complete\s*data:\s*/, '');  // Remove 'event: complete data:'


    try {
      const cleanData = JSON.parse(cleanedResponse);
      //return cleanData;
      return  cleanData[0];
      
    } catch (parseError) {
      console.error('Error parsing cleaned response:', parseError.message);
    }

  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}



module.exports = sendRequest;

