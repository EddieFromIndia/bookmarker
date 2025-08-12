const logger = (req, res, next) => {
    console.log();
    next();
};

export default logger;