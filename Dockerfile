# Use an official Python runtime as a parent image
FROM python:3.8-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Create a directory for Matplotlib configuration and ensure it is writable
RUN mkdir -p /usr/src/app/matplotlib_config && chmod -R 777 /usr/src/app/matplotlib_config

# Set environment variable for Matplotlib configuration directory
ENV MPLCONFIGDIR=/usr/src/app/matplotlib_config

# Create a directory for logs and ensure it is writable
RUN mkdir -p /usr/src/app/logs && chmod -R 777 /usr/src/app/logs

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Install dependencies without using cache and upgrade packages if needed
RUN pip install --upgrade --no-cache-dir -r requirements.txt

# Make port 7860 available to the world outside this container
EXPOSE 7860

# Run app.py when the container launches
CMD ["python", "app.py"]
