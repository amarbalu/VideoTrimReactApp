import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { VideoPlayer } from './VideoPlayer';
import VideoUpload from './VideoUpload';
import './VideoEditor.css'; // Add required CSS here

const ffmpeg = createFFmpeg({ log: true });

const VideoEditor = () => {
    const [ffmpegLoaded, setFFmpegLoaded] = useState(false);
    const [videoFile, setVideoFile] = useState(null);
    const [videoPlayer, setVideoPlayer] = useState();
    const [trimmedVideoUrl, setTrimmedVideoUrl] = useState();
    const [processing, setProcessing] = useState(false);
    const [frames, setFrames] = useState([]);
    const [startFrame, setStartFrame] = useState(null);
    const [endFrame, setEndFrame] = useState(null);

    useEffect(() => {
        if (startFrame !== null && endFrame !== null) {
            // Seek to the start frame
            videoPlayer.seek(frames[startFrame].time);
            // Wait for the video to seek to the start frame, then set up the interval to pause at the end frame time
            const handleSeeked = () => {
                const interval = setInterval(() => {
                    const currentTime = videoPlayer.getState().player.currentTime;
                    if (currentTime >= frames[endFrame].time) {
                        videoPlayer.pause();
                        clearInterval(interval);
                    }
                }, 100);
            };
            videoPlayer.subscribeToStateChange(handleSeeked);
            return () => {
                videoPlayer.unsubscribeFromStateChange(handleSeeked);
            };
        }
    }, [startFrame, endFrame, frames, videoPlayer]);
    


    useEffect(() => {
        ffmpeg.load().then(() => {
            setFFmpegLoaded(true);
        });
    }, []);

    useEffect(() => {
        if (videoFile) {
            extractFrames(videoFile);
        } else {
            setFrames([]);
            setStartFrame(null);
            setEndFrame(null);
            setTrimmedVideoUrl(null);
        }
    }, [videoFile]);

    const extractFrames = (videoFile) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const framesArray = [];
        video.src = URL.createObjectURL(videoFile);

        video.addEventListener('loadeddata', () => {
            const videoDuration = video.duration;
            const frameCount = 10; // Number of frames to extract
            const interval = videoDuration / (frameCount - 1); // Calculate interval between frames

            video.currentTime = 0;
            let frameIndex = 0;

            const captureFrame = () => {
                if (frameIndex >= frameCount) {
                    setFrames(framesArray);
                    return;
                }

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                framesArray.push({ src: canvas.toDataURL('image/jpeg'), time: video.currentTime });
                frameIndex++;
                video.currentTime = frameIndex * interval;
            };

            video.addEventListener('seeked', captureFrame);
            captureFrame();
        });
    };

    const handleFrameClick = (index) => {
        if (startFrame === null || (startFrame !== null && endFrame !== null)) {
            setStartFrame(index);
            setEndFrame(null);
        } else if (startFrame !== null && endFrame === null) {
            setEndFrame(index);
        }
    };

    const handleTrim = async () => {
        if (startFrame !== null && endFrame !== null) {
            const startTime = frames[startFrame].time;
            const endTime = frames[endFrame].time;
            setProcessing(true);

            try {
                ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));
                await ffmpeg.run('-i', 'input.mp4', '-ss', `${startTime}`, '-to', `${endTime}`, '-c', `copy`, `output.mp4`);
                const data = ffmpeg.FS('readFile', 'output.mp4');
                const trimmedBlob = new Blob([data.buffer], { type: 'video/mp4' });

                setTrimmedVideoUrl(URL.createObjectURL(trimmedBlob));
            } catch (error) {
                console.error('Error trimming video:', error);
            } finally {
                setProcessing(false);
            }
        }
    };

    return (
        <div>
            <Spin
                spinning={processing || !ffmpegLoaded}
                tip={!ffmpegLoaded ? "Waiting for FFmpeg to load..." : "Processing..."}
            >
                <div>
                    {videoFile ? (
                        <VideoPlayer
                            src={URL.createObjectURL(videoFile)}
                            onPlayerChange={(videoPlayer) => {
                                setVideoPlayer(videoPlayer)
                            }}
                        />
                    ) : (
                        <h1>Upload a video</h1>
                    )}
                </div>
                <div className="upload-div">
                    <VideoUpload
                        disabled={!!videoFile}
                        onChange={setVideoFile}
                        onRemove={() => setVideoFile(null)}
                    />
                </div>
                <div className="frame-container">
                    {frames.map((frame, index) => (
                        <img
                            key={index}
                            src={frame.src}
                            alt={`frame-${index}`}
                            className={`frame ${index === startFrame ? 'selected' : ''} ${index === endFrame ? 'selected' : ''}`}
                            onClick={() => handleFrameClick(index)}
                        />
                    ))}
                </div>
                <div className="conversion-div">
                    <button onClick={handleTrim} disabled={processing || startFrame === null || endFrame === null}>
                        Trim Video
                    </button>
                </div>
                {trimmedVideoUrl && (
                    <div className="result-div">
                        <h3>Trimmed Video</h3>
                        <video src={trimmedVideoUrl} controls className="trimmed-video" />
                        <a href={trimmedVideoUrl} download="trimmed-video.mp4" className="ant-btn ant-btn-default">
                            Download
                        </a>
                    </div>
                )}
            </Spin>
        </div>
    );
};

export default VideoEditor;
