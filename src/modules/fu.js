const cloudinary = require('cloudinary').v2;

async function fileutc(media,fileType) {
    // Configuration
    cloudinary.config({
        cloud_name: 'devgecsft',
        api_key: '524585516253683',
        api_secret: '7zLB4GFQqf2VzLYJV8fE8ZGZ4EI' // Replace with your actual API secret
    });

    try {
        // Upload an image
        const uploadResult = await cloudinary.uploader.upload(
            media,
            {
                resource_type: fileType,
                public_id: 'media+fileType',
            }
        );


        return uploadResult;

    } catch (error) {
        console.error(error);
    }
}

module.exports = {fileutc};

