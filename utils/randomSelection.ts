export const getRandomItem = (array: Array<string>) => {
    // Ensure the array is not empty
    if (array.length === 0) {
        return null; // or throw an error, or handle it as needed
    }

    // Get a random index within the bounds of the array
    const randomIndex = Math.floor(Math.random() * array.length);

    // Return the item at the random index
    return array[randomIndex];
}