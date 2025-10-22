package menu

import "time"

// Clock abstracts time retrieval so services can share the same notion of "now".
type Clock interface {
	Now() time.Time
}

type locationClock struct {
	location *time.Location
}

// NewLocationClock returns a clock that reports time in the provided location.
func NewLocationClock(location *time.Location) Clock {
	return &locationClock{location: location}
}

// NewKSTClock returns a clock that reports time in the Asia/Seoul timezone.
func NewKSTClock() Clock {
	location, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		location = time.FixedZone("KST", 9*60*60)
	}
	return &locationClock{location: location}
}

func (c *locationClock) Now() time.Time {
	if c.location == nil {
		return time.Now()
	}
	return time.Now().In(c.location)
}
