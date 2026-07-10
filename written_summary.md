Written Summary

My Habitat CLI calculates each tick by adding the power draw of all local modules based on their current runtime states, then multiplying that total by the number of ticks. It subtracts that energy from the local battery, increases the tick counter, and saves the updated state.
